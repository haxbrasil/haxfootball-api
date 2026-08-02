import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { deriveMatchMetrics } from "@/features/match-events/_shared/domain/metrics";
import { listMatchEventsByMatchIds } from "@/features/match-events/_shared/db/queries";
import { eventSchemaVersions } from "@/features/event-schemas/db";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import {
  championshipMatches,
  championshipProgressionRoutes,
  championshipSpots
} from "@/features/championships/format-scheduling/db";
import {
  invalidateChampionshipDownstreamMatches,
  placeTeamIntoChampionshipSpot
} from "@/features/championships/format-scheduling/progression";
import {
  calculateCorrectionCascade,
  type CascadeImpact
} from "@/features/championships/matches-statistics/cascade";
import {
  projectChampionshipMatchOperations,
  requireMatchContext,
  resolveAllowedPrograms,
  type ChampionshipMatchContext
} from "@/features/championships/matches-statistics/evidence";
import { areProgramsCompatible } from "@/features/championships/matches-statistics/program-compatibility";
import type {
  ChampionshipAttributionInput,
  ChampionshipSettlementDraft,
  PreviewChampionshipSettlementInput,
  SettleChampionshipMatchInput,
  UpdateChampionshipAttributionsInput
} from "@/features/championships/matches-statistics/inputs";
import {
  championshipMatchAppearances,
  championshipMatchAttributions,
  championshipMatchEvidence,
  championshipMatchEvidenceRounds,
  championshipMatchResultRevisions,
  championshipStatisticEntries
} from "@/features/championships/matches-statistics/db";
import type {
  ChampionshipMatchOperationsResponse,
  ChampionshipSettlementPreviewResponse
} from "@/features/championships/matches-statistics/responses";
import {
  championshipParticipants,
  championshipTeamIdentities,
  championshipTeamMemberships,
  championshipTeams
} from "@/features/championships/people/db";
import { refreshChampionshipRecords } from "@/features/championships/history/records";
import { reconcileCalculatedChampionshipHonors } from "@/features/championships/history/honors";
import { resolveChampionshipAppearanceSide } from "@/features/championships/matches-statistics/appearance-side";
import { matches, matchPlayerStints } from "@/features/matches/db";
import { players } from "@/features/players/db";
import { badRequest, conflict } from "@/shared/http/errors";

type Outcome = "win" | "loss" | "draw";
type Side = "a" | "b";

type NormalizedSettlement = {
  method: ChampionshipSettlementDraft["method"];
  sideAPlayedScore: number;
  sideBPlayedScore: number;
  sideAAdministrativeScore: number;
  sideBAdministrativeScore: number;
  sideAOfficialScore: number;
  sideBOfficialScore: number;
  sideAOutcome: Outcome;
  sideBOutcome: Outcome;
};

type AppearanceReview = {
  sourcePlayer: typeof players.$inferSelect;
  sourceAccount: typeof accounts.$inferSelect | null;
  observedSide: Side;
  playingTimeSeconds: number;
  participant: typeof championshipParticipants.$inferSelect | null;
  findings: string[];
  registered: boolean;
  onRoster: boolean;
  attribution: {
    mode: "default" | "exclude" | "redirect";
    targetParticipant: typeof championshipParticipants.$inferSelect | null;
    reason: string | null;
  };
};

export async function previewChampionshipMatchSettlement(
  championshipUuid: string,
  matchUuid: string,
  input: PreviewChampionshipSettlementInput
): Promise<ChampionshipSettlementPreviewResponse> {
  const context = await requireMatchContext(db, championshipUuid, matchUuid);

  await requireChampionshipActor(db, {
    actorAccountUuid: input.actorAccountUuid,
    championshipId: context.championship.id,
    permission: ["championship:admin", "championship:operate"]
  });

  return buildSettlementPreview(db, context, input);
}

export async function settleChampionshipMatch(
  championshipUuid: string,
  matchUuid: string,
  input: SettleChampionshipMatchInput
): Promise<ChampionshipMatchOperationsResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action:
        input.expectedResultRevision === 0
          ? "match.settled"
          : "match.result.corrected"
    },
    async (tx, championship, actor) => {
      const context = await requireMatchContext(
        tx,
        championshipUuid,
        matchUuid
      );
      requireRevision(
        "evidence",
        context.match.evidenceRevision,
        input.expectedEvidenceRevision
      );
      requireRevision(
        "result",
        context.match.resultRevision,
        input.expectedResultRevision
      );
      const preview = await buildSettlementPreview(
        tx,
        {
          ...context,
          championship: {
            ...context.championship,
            revision: input.expectedRevision
          }
        },
        input
      );

      if (preview.previewHash !== input.previewHash) {
        throw conflict("Settlement preview is stale", {
          expectedPreviewHash: input.previewHash,
          currentPreviewHash: preview.previewHash,
          currentPreview: preview
        });
      }
      const blocking = preview.findings.filter(
        (finding) => finding.severity === "blocking"
      );

      if (blocking.length > 0) {
        throw badRequest(
          `Settlement has blocking findings: ${blocking
            .map((finding) => finding.code)
            .join(", ")}`
        );
      }

      const result = normalizeSettlement(context, input);
      const currentResults = await tx
        .select()
        .from(championshipMatchResultRevisions)
        .where(
          and(
            eq(
              championshipMatchResultRevisions.championshipMatchId,
              context.match.id
            ),
            eq(championshipMatchResultRevisions.state, "current")
          )
        );
      const now = new Date().toISOString();

      for (const currentResult of currentResults) {
        await tx
          .update(championshipMatchResultRevisions)
          .set({ state: "superseded", supersededAt: now })
          .where(eq(championshipMatchResultRevisions.id, currentResult.id));
      }

      await invalidateChampionshipDownstreamMatches(
        tx,
        context.championship.id,
        preview.downstream.map((impact) => impact.matchUuid),
        now
      );
      const [resultRevision] = await tx
        .insert(championshipMatchResultRevisions)
        .values({
          championshipId: championship.id,
          championshipMatchId: context.match.id,
          revision: context.match.resultRevision + 1,
          state: "current",
          sideATeamId: context.match.sideATeamId,
          sideBTeamId: context.match.sideBTeamId,
          ...result,
          evidenceDerived:
            result.method === "played" || result.method === "mid-game-forfeit",
          note: input.note ?? null,
          settledByAccountId: actor.account.id,
          settledAt: now
        })
        .returning();
      const appearanceReviews = await buildAppearanceReviews(
        tx,
        context,
        input.attributions ?? []
      );

      await persistAppearancesAndAttributions(
        tx,
        resultRevision.id,
        appearanceReviews,
        actor.account.id
      );
      await persistStatistics(
        tx,
        championship.id,
        context,
        resultRevision.id,
        result,
        appearanceReviews
      );
      await refreshChampionshipRecords(tx, championship.id);
      await applyProgression(tx, context, result);
      const recalculatedHonorUuids =
        await reconcileCalculatedChampionshipHonors(
          tx,
          championship.id,
          actor.account.id,
          ["spot-result", "metric-ranking"],
          input.note ?? "Resultado oficial da partida atualizado"
        );
      const [updatedMatch] = await tx
        .update(championshipMatches)
        .set({
          resultRevision: context.match.resultRevision + 1,
          revision: context.match.revision + 1,
          scheduleStatus: "played",
          updatedAt: now
        })
        .where(eq(championshipMatches.id, context.match.id))
        .returning();
      const updatedContext = {
        ...context,
        championship,
        match: updatedMatch
      };
      const response = await projectChampionshipMatchOperations(
        tx,
        updatedContext,
        true
      );

      return {
        response: () => response,
        targetType: "championship-match",
        targetUuid: context.match.uuid,
        before: currentResults[0] ?? null,
        after: resultRevision,
        reason: input.note ?? null,
        metadata: {
          previewHash: input.previewHash,
          programMismatchReason: input.programMismatchReason ?? null,
          evidenceQualityReviewed: input.evidenceQualityReviewed,
          invalidatedMatches: preview.downstream.map(
            (impact) => impact.matchUuid
          ),
          progression: preview.progression,
          recalculatedHonorUuids
        },
        outboxTopic: "championship.match.settled"
      };
    }
  );
}

export async function updateChampionshipMatchAttributions(
  championshipUuid: string,
  matchUuid: string,
  input: UpdateChampionshipAttributionsInput
): Promise<ChampionshipMatchOperationsResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "match.attributions.updated"
    },
    async (tx, championship, actor) => {
      const context = await requireMatchContext(
        tx,
        championshipUuid,
        matchUuid
      );
      requireRevision(
        "result",
        context.match.resultRevision,
        input.expectedResultRevision
      );
      const [current] = await tx
        .select()
        .from(championshipMatchResultRevisions)
        .where(
          and(
            eq(
              championshipMatchResultRevisions.championshipMatchId,
              context.match.id
            ),
            eq(championshipMatchResultRevisions.state, "current")
          )
        );

      if (!current) {
        throw badRequest("A settled result is required before attribution");
      }

      const reviews = await buildAppearanceReviews(
        tx,
        context,
        input.attributions
      );
      const now = new Date().toISOString();
      await tx
        .update(championshipMatchResultRevisions)
        .set({ state: "superseded", supersededAt: now })
        .where(eq(championshipMatchResultRevisions.id, current.id));
      const [next] = await tx
        .insert(championshipMatchResultRevisions)
        .values({
          championshipId: championship.id,
          championshipMatchId: context.match.id,
          revision: context.match.resultRevision + 1,
          state: "current",
          sideATeamId: current.sideATeamId,
          sideBTeamId: current.sideBTeamId,
          method: current.method,
          sideAPlayedScore: current.sideAPlayedScore,
          sideBPlayedScore: current.sideBPlayedScore,
          sideAAdministrativeScore: current.sideAAdministrativeScore,
          sideBAdministrativeScore: current.sideBAdministrativeScore,
          sideAOfficialScore: current.sideAOfficialScore,
          sideBOfficialScore: current.sideBOfficialScore,
          sideAOutcome: current.sideAOutcome,
          sideBOutcome: current.sideBOutcome,
          evidenceDerived: current.evidenceDerived,
          note: current.note,
          settledByAccountId: actor.account.id,
          settledAt: now
        })
        .returning();
      await persistAppearancesAndAttributions(
        tx,
        next.id,
        reviews,
        actor.account.id
      );
      await persistStatistics(
        tx,
        championship.id,
        context,
        next.id,
        {
          method: current.method,
          sideAPlayedScore: current.sideAPlayedScore,
          sideBPlayedScore: current.sideBPlayedScore,
          sideAAdministrativeScore: current.sideAAdministrativeScore,
          sideBAdministrativeScore: current.sideBAdministrativeScore,
          sideAOfficialScore: current.sideAOfficialScore,
          sideBOfficialScore: current.sideBOfficialScore,
          sideAOutcome: current.sideAOutcome,
          sideBOutcome: current.sideBOutcome
        },
        reviews
      );
      await refreshChampionshipRecords(tx, championship.id);
      const [updatedMatch] = await tx
        .update(championshipMatches)
        .set({
          resultRevision: context.match.resultRevision + 1,
          revision: context.match.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipMatches.id, context.match.id))
        .returning();
      const response = await projectChampionshipMatchOperations(
        tx,
        { ...context, championship, match: updatedMatch },
        true
      );

      return {
        response: () => response,
        targetType: "championship-match",
        targetUuid: context.match.uuid,
        before: { resultRevision: current.revision },
        after: {
          resultRevision: next.revision,
          attributions: input.attributions
        },
        metadata: { sourceAppearanceCount: reviews.length }
      };
    }
  );
}

export async function buildSettlementPreview(
  database: DatabaseExecutor,
  context: ChampionshipMatchContext,
  input: ChampionshipSettlementDraft
): Promise<ChampionshipSettlementPreviewResponse> {
  const result = normalizeSettlement(context, input);
  const [evidence, evidenceRounds, appearanceReviews, allowedPrograms] =
    await Promise.all([
      database
        .select()
        .from(championshipMatchEvidence)
        .where(
          eq(championshipMatchEvidence.championshipMatchId, context.match.id)
        )
        .then((rows) => rows[0] ?? null),
      database
        .select({
          round: championshipMatchEvidenceRounds,
          evidence: championshipMatchEvidence
        })
        .from(championshipMatchEvidenceRounds)
        .innerJoin(
          championshipMatchEvidence,
          eq(
            championshipMatchEvidenceRounds.evidenceId,
            championshipMatchEvidence.id
          )
        )
        .where(
          eq(championshipMatchEvidence.championshipMatchId, context.match.id)
        )
        .orderBy(asc(championshipMatchEvidenceRounds.position)),
      buildAppearanceReviews(database, context, input.attributions ?? []),
      resolveAllowedPrograms(database, context.championship.id)
    ]);
  const findings: ChampionshipSettlementPreviewResponse["findings"] = [];

  if (!context.match.sideATeamId || !context.match.sideBTeamId) {
    findings.push({
      code: "missing-team",
      severity: "blocking",
      message: "Os dois lados precisam ter equipes posicionadas."
    });
  }
  if (
    (result.method === "played" || result.method === "mid-game-forfeit") &&
    !evidence
  ) {
    findings.push({
      code: "evidence-required",
      severity: "blocking",
      message: "Este método exige uma partida registrada como evidência."
    });
  }
  if (evidence && !input.evidenceQualityReviewed) {
    findings.push({
      code: "evidence-review-required",
      severity: "blocking",
      message: "A qualidade de todas as evidências precisa ser revisada."
    });
  }
  if (
    evidence &&
    (evidence.quality === "recovered" ||
      evidence.quality === "partial" ||
      evidence.quality === "historical" ||
      evidence.quality === "unknown")
  ) {
    findings.push({
      code: `evidence-${evidence.quality}`,
      severity: "warning",
      message: "A evidência exige atenção por ser recuperada ou incompleta."
    });
  }

  const actualProgramIds = new Set(
    evidenceRounds
      .map(({ round }) => round.roomProgramId)
      .filter((id): id is number => id !== null)
  );
  const programMismatch = !areProgramsCompatible(
    actualProgramIds,
    new Set(allowedPrograms.map((program) => program.id))
  );

  if (programMismatch && !input.programMismatchReason) {
    findings.push({
      code: "program-mismatch",
      severity: "blocking",
      message:
        "A partida usa um programa não autorizado nesta edição e exige justificativa."
    });
  } else if (programMismatch) {
    findings.push({
      code: "program-mismatch-acknowledged",
      severity: "warning",
      message: "O uso do programa não autorizado será registrado na auditoria."
    });
  }

  const evidenceScore = evidence
    ? accumulatedEvidenceScore(evidence.scoreMode, evidenceRounds)
    : null;
  if (
    result.method === "played" &&
    evidenceScore &&
    (evidenceScore.sideAScore !== result.sideAPlayedScore ||
      evidenceScore.sideBScore !== result.sideBPlayedScore)
  ) {
    findings.push({
      code: "played-score-mismatch",
      severity: "blocking",
      message: "O placar jogado não corresponde à evidência selecionada."
    });
  }

  for (const appearance of appearanceReviews) {
    for (const finding of appearance.findings) {
      findings.push({
        code: `${finding}:${appearance.sourcePlayer.externalId}`,
        severity: "warning",
        message: `${appearance.sourcePlayer.name}: ${appearanceFindingLabel(
          finding
        )}`
      });
    }
  }

  const { progression, downstream } = await calculateProgressionImpact(
    database,
    context,
    result
  );
  const previewWithoutHash = {
    championshipRevision: context.championship.revision,
    evidenceRevision: context.match.evidenceRevision,
    resultRevision: context.match.resultRevision,
    match: {
      uuid: context.match.uuid,
      label: context.match.label,
      sideA: await teamReference(database, context.match.sideATeamId),
      sideB: await teamReference(database, context.match.sideBTeamId)
    },
    result,
    findings,
    appearances: appearanceReviews.map(toAppearanceResponse),
    progression,
    downstream
  };

  return {
    previewHash: hashPreview(previewWithoutHash),
    ...previewWithoutHash
  };
}

function normalizeSettlement(
  context: ChampionshipMatchContext,
  input: ChampionshipSettlementDraft
): NormalizedSettlement {
  let sideAPlayedScore = input.sideAPlayedScore;
  let sideBPlayedScore = input.sideBPlayedScore;
  let sideAAdministrativeScore = input.sideAAdministrativeScore ?? 0;
  let sideBAdministrativeScore = input.sideBAdministrativeScore ?? 0;
  let sideAOutcome = input.sideAOutcome;
  let sideBOutcome = input.sideBOutcome;

  validateOutcomePair(sideAOutcome, sideBOutcome, input.method);

  if (input.method === "full-forfeit") {
    const score = context.championship.rules.match.fullForfeitScore;

    if (sideAOutcome === "win") {
      sideAPlayedScore = score.winner;
      sideBPlayedScore = score.loser;
    } else if (sideBOutcome === "win") {
      sideAPlayedScore = score.loser;
      sideBPlayedScore = score.winner;
    } else {
      throw badRequest("A full forfeit requires exactly one winner");
    }
    sideAAdministrativeScore = 0;
    sideBAdministrativeScore = 0;
  }

  if (input.method === "double-forfeit") {
    sideAPlayedScore = 0;
    sideBPlayedScore = 0;
    sideAAdministrativeScore = 0;
    sideBAdministrativeScore = 0;
    sideAOutcome = "loss";
    sideBOutcome = "loss";
  }

  if (input.method === "mid-game-forfeit") {
    if (
      (sideAOutcome === "win" && sideBAdministrativeScore > 0) ||
      (sideBOutcome === "win" && sideAAdministrativeScore > 0)
    ) {
      throw badRequest(
        "A mid-game forfeit adjustment can only benefit the explicit winner"
      );
    }
  } else if (
    input.method !== "manual" &&
    input.method !== "historical" &&
    (sideAAdministrativeScore > 0 || sideBAdministrativeScore > 0)
  ) {
    throw badRequest(
      "Administrative score is only valid for manual, historical, or mid-game forfeit results"
    );
  }

  if (
    sideAOutcome === "draw" &&
    context.championship.rules.match.drawPolicy !== "allowed" &&
    input.method !== "historical"
  ) {
    throw badRequest("This championship does not allow drawn official results");
  }

  return {
    method: input.method,
    sideAPlayedScore,
    sideBPlayedScore,
    sideAAdministrativeScore,
    sideBAdministrativeScore,
    sideAOfficialScore: sideAPlayedScore + sideAAdministrativeScore,
    sideBOfficialScore: sideBPlayedScore + sideBAdministrativeScore,
    sideAOutcome,
    sideBOutcome
  };
}

function validateOutcomePair(
  sideA: Outcome,
  sideB: Outcome,
  method: ChampionshipSettlementDraft["method"]
) {
  const valid =
    (sideA === "win" && sideB === "loss") ||
    (sideA === "loss" && sideB === "win") ||
    (sideA === "draw" && sideB === "draw") ||
    (method === "double-forfeit" && sideA === "loss" && sideB === "loss");

  if (!valid) {
    throw badRequest("Match outcomes are inconsistent");
  }
}

async function buildAppearanceReviews(
  database: DatabaseExecutor,
  context: ChampionshipMatchContext,
  attributionInputs: ChampionshipAttributionInput[]
): Promise<AppearanceReview[]> {
  const evidenceRounds = await database
    .select({
      evidenceRound: championshipMatchEvidenceRounds,
      evidence: championshipMatchEvidence
    })
    .from(championshipMatchEvidenceRounds)
    .innerJoin(
      championshipMatchEvidence,
      eq(
        championshipMatchEvidenceRounds.evidenceId,
        championshipMatchEvidence.id
      )
    )
    .where(eq(championshipMatchEvidence.championshipMatchId, context.match.id))
    .orderBy(asc(championshipMatchEvidenceRounds.position));

  if (evidenceRounds.length === 0) {
    return buildAppearanceReviewsFromCurrentResult(
      database,
      context,
      attributionInputs
    );
  }

  const stints = await database
    .select({
      stint: matchPlayerStints,
      player: players,
      account: accounts
    })
    .from(matchPlayerStints)
    .innerJoin(players, eq(matchPlayerStints.playerId, players.id))
    .leftJoin(accounts, eq(players.accountId, accounts.id))
    .where(
      inArray(
        matchPlayerStints.matchId,
        evidenceRounds.map(({ evidenceRound }) => evidenceRound.physicalMatchId)
      )
    );
  const participantRows = await database
    .select()
    .from(championshipParticipants)
    .where(
      eq(championshipParticipants.championshipId, context.championship.id)
    );
  const participantByAccountId = new Map(
    participantRows
      .filter((participant) => participant.accountId !== null)
      .map((participant) => [participant.accountId!, participant])
  );
  const participantByUuid = new Map(
    participantRows.map((participant) => [participant.uuid, participant])
  );
  const memberships = await database
    .select()
    .from(championshipTeamMemberships)
    .where(
      and(
        eq(championshipTeamMemberships.championshipId, context.championship.id),
        isNull(championshipTeamMemberships.endedAt)
      )
    );
  const membershipByParticipantId = new Map(
    memberships.map((membership) => [membership.participantId, membership])
  );
  const roundByMatchId = new Map(
    evidenceRounds.map(({ evidenceRound }) => [
      evidenceRound.physicalMatchId,
      evidenceRound
    ])
  );
  const grouped = new Map<
    number,
    {
      player: typeof players.$inferSelect;
      account: typeof accounts.$inferSelect | null;
      times: Record<Side, number>;
      appearanceCounts: Record<Side, number>;
    }
  >();

  for (const row of stints) {
    const round = roundByMatchId.get(row.stint.matchId);
    if (!round) continue;
    const side = sideForTeam(row.stint.team, round.orientation);
    const end =
      row.stint.leftElapsedSeconds ??
      round.elapsedSeconds ??
      row.stint.joinedElapsedSeconds ??
      0;
    const start = row.stint.joinedElapsedSeconds ?? 0;
    const item = grouped.get(row.player.id) ?? {
      player: row.player,
      account: row.account,
      times: { a: 0, b: 0 },
      appearanceCounts: { a: 0, b: 0 }
    };
    item.times[side] += Math.max(0, end - start);
    item.appearanceCounts[side] += 1;
    grouped.set(row.player.id, item);
  }

  const attributionBySourceId = new Map(
    attributionInputs.map((input) => [input.sourcePlayerId, input])
  );

  return [...grouped.values()]
    .sort((left, right) => left.player.id - right.player.id)
    .map((item) => {
      const { observedSide, ambiguous } = resolveChampionshipAppearanceSide(
        item.times,
        item.appearanceCounts
      );
      const participant = item.account
        ? (participantByAccountId.get(item.account.id) ?? null)
        : null;
      const membership = participant
        ? membershipByParticipantId.get(participant.id)
        : null;
      const observedTeamId =
        observedSide === "a"
          ? context.match.sideATeamId
          : context.match.sideBTeamId;
      const findings: string[] = [];

      if (!participant || participant.status !== "active") {
        findings.push("unregistered");
      }
      if (!membership || membership.teamId !== observedTeamId) {
        findings.push(
          membership && membership.teamId !== observedTeamId
            ? "wrong-side"
            : "off-roster"
        );
      }
      if (ambiguous) {
        findings.push("ambiguous-side");
      }

      const requested = attributionBySourceId.get(item.player.externalId);
      let targetParticipant:
        | typeof championshipParticipants.$inferSelect
        | null = null;

      if (requested?.mode === "redirect") {
        targetParticipant = requested.targetParticipantUuid
          ? (participantByUuid.get(requested.targetParticipantUuid) ?? null)
          : null;

        if (
          !targetParticipant ||
          !targetParticipant.accountId ||
          targetParticipant.status !== "active"
        ) {
          throw badRequest(
            "Redirect targets must be active account-backed championship participants"
          );
        }
      }

      return {
        sourcePlayer: item.player,
        sourceAccount: item.account,
        observedSide,
        playingTimeSeconds: item.times.a + item.times.b,
        participant,
        findings,
        registered: !!participant && participant.status === "active",
        onRoster: !!membership && membership.teamId === observedTeamId,
        attribution: {
          mode: requested?.mode ?? ("default" as const),
          targetParticipant,
          reason: requested?.reason ?? null
        }
      };
    });
}

async function buildAppearanceReviewsFromCurrentResult(
  database: DatabaseExecutor,
  context: ChampionshipMatchContext,
  attributionInputs: ChampionshipAttributionInput[]
): Promise<AppearanceReview[]> {
  const [currentResult] = await database
    .select({ id: championshipMatchResultRevisions.id })
    .from(championshipMatchResultRevisions)
    .where(
      and(
        eq(
          championshipMatchResultRevisions.championshipMatchId,
          context.match.id
        ),
        eq(championshipMatchResultRevisions.state, "current")
      )
    );

  if (!currentResult) {
    return [];
  }

  const [appearanceRows, participantRows] = await Promise.all([
    database
      .select({
        appearance: championshipMatchAppearances,
        player: players,
        account: accounts
      })
      .from(championshipMatchAppearances)
      .innerJoin(
        players,
        eq(championshipMatchAppearances.sourcePlayerId, players.id)
      )
      .leftJoin(
        accounts,
        eq(championshipMatchAppearances.sourceAccountId, accounts.id)
      )
      .where(
        eq(championshipMatchAppearances.resultRevisionId, currentResult.id)
      )
      .orderBy(asc(championshipMatchAppearances.id)),
    database
      .select()
      .from(championshipParticipants)
      .where(
        eq(championshipParticipants.championshipId, context.championship.id)
      )
  ]);
  const participantByAccountId = new Map(
    participantRows
      .filter((participant) => participant.accountId !== null)
      .map((participant) => [participant.accountId!, participant])
  );
  const participantByUuid = new Map(
    participantRows.map((participant) => [participant.uuid, participant])
  );
  const attributionBySourceId = new Map(
    attributionInputs.map((input) => [input.sourcePlayerId, input])
  );

  return appearanceRows.map(({ appearance, player, account }) => {
    const requested = attributionBySourceId.get(player.externalId);
    const targetParticipant =
      requested?.mode === "redirect" && requested.targetParticipantUuid
        ? (participantByUuid.get(requested.targetParticipantUuid) ?? null)
        : null;

    if (
      requested?.mode === "redirect" &&
      (!targetParticipant ||
        !targetParticipant.accountId ||
        targetParticipant.status !== "active")
    ) {
      throw badRequest(
        "Redirect targets must be active account-backed championship participants"
      );
    }

    return {
      sourcePlayer: player,
      sourceAccount: account,
      observedSide: appearance.observedSide,
      playingTimeSeconds: appearance.playingTimeSeconds,
      participant: account
        ? (participantByAccountId.get(account.id) ?? null)
        : null,
      findings: Array.isArray(appearance.findings)
        ? appearance.findings.filter(
            (finding): finding is string => typeof finding === "string"
          )
        : [],
      registered: appearance.registered,
      onRoster: appearance.onRoster,
      attribution: {
        mode: requested?.mode ?? ("default" as const),
        targetParticipant,
        reason: requested?.reason ?? null
      }
    };
  });
}

async function calculateProgressionImpact(
  database: DatabaseExecutor,
  context: ChampionshipMatchContext,
  result: NormalizedSettlement
) {
  const [routeRows, spotRows, matchRows, teamRows] = await Promise.all([
    database
      .select()
      .from(championshipProgressionRoutes)
      .where(
        eq(
          championshipProgressionRoutes.championshipId,
          context.championship.id
        )
      ),
    database
      .select()
      .from(championshipSpots)
      .where(eq(championshipSpots.championshipId, context.championship.id)),
    database
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championshipId, context.championship.id)),
    database
      .select({ team: championshipTeams, identity: championshipTeamIdentities })
      .from(championshipTeams)
      .leftJoin(
        championshipTeamIdentities,
        eq(championshipTeams.teamIdentityId, championshipTeamIdentities.id)
      )
      .where(eq(championshipTeams.championshipId, context.championship.id))
  ]);
  const spotById = new Map(spotRows.map((spot) => [spot.id, spot]));
  const teamById = new Map(teamRows.map((row) => [row.team.id, row]));
  const winnerTeamId =
    result.sideAOutcome === "win"
      ? context.match.sideATeamId
      : result.sideBOutcome === "win"
        ? context.match.sideBTeamId
        : null;
  const loserTeamId =
    result.sideAOutcome === "loss" && result.sideBOutcome !== "loss"
      ? context.match.sideATeamId
      : result.sideBOutcome === "loss" && result.sideAOutcome !== "loss"
        ? context.match.sideBTeamId
        : null;
  const sourceRoutes = routeRows.filter(
    (route): route is typeof route & { sourceOutcome: "winner" | "loser" } =>
      route.sourceMatchId === context.match.id &&
      route.state === "active" &&
      routeConditionMatches(route.condition, result) &&
      (route.sourceOutcome === "winner" || route.sourceOutcome === "loser")
  );
  const progression = sourceRoutes.map((route) => {
    const spot = spotById.get(route.destinationSpotId)!;
    const nextTeamId =
      route.sourceOutcome === "winner" ? winnerTeamId : loserTeamId;

    return {
      routeUuid: route.uuid,
      outcome: route.sourceOutcome!,
      destinationSpotUuid: spot.uuid,
      destinationSpotLabel: spot.label,
      previousTeam: teamReferenceFromRow(
        teamById.get(spot.currentTeamId ?? -1)
      ),
      nextTeam: teamReferenceFromRow(teamById.get(nextTeamId ?? -1)),
      destinationSpotId: spot.id,
      previousTeamId: spot.currentTeamId,
      nextTeamId
    };
  });
  const changedSpotIds = progression
    .filter((impact) => impact.previousTeamId !== impact.nextTeamId)
    .map((impact) => impact.destinationSpotId);
  const cascade = calculateCorrectionCascade(
    context.match.id,
    changedSpotIds,
    matchRows,
    routeRows
      .filter(
        (route) => route.sourceMatchId !== null && route.state === "active"
      )
      .map((route) => ({
        sourceMatchId: route.sourceMatchId!,
        destinationSpotId: route.destinationSpotId
      }))
  );

  return {
    progression: progression.map(
      ({
        destinationSpotId: _destinationSpotId,
        previousTeamId: _previousTeamId,
        nextTeamId: _nextTeamId,
        ...impact
      }) => impact
    ),
    downstream: cascade.map(toDownstreamResponse)
  };
}

async function applyProgression(
  database: DatabaseExecutor,
  context: ChampionshipMatchContext,
  result: NormalizedSettlement
) {
  const routes = await database
    .select()
    .from(championshipProgressionRoutes)
    .where(
      and(
        eq(championshipProgressionRoutes.sourceMatchId, context.match.id),
        eq(championshipProgressionRoutes.state, "active")
      )
    );
  const winnerTeamId =
    result.sideAOutcome === "win"
      ? context.match.sideATeamId
      : result.sideBOutcome === "win"
        ? context.match.sideBTeamId
        : null;
  const loserTeamId =
    result.sideAOutcome === "loss" && result.sideBOutcome !== "loss"
      ? context.match.sideATeamId
      : result.sideBOutcome === "loss" && result.sideAOutcome !== "loss"
        ? context.match.sideBTeamId
        : null;

  for (const route of routes) {
    if (route.sourceOutcome !== "winner" && route.sourceOutcome !== "loser") {
      continue;
    }
    if (!routeConditionMatches(route.condition, result)) continue;
    const nextTeamId =
      route.sourceOutcome === "winner" ? winnerTeamId : loserTeamId;
    await placeTeamIntoChampionshipSpot(
      database,
      route.destinationSpotId,
      nextTeamId
    );
  }
}

function routeConditionMatches(
  condition: "always" | "if-side-a-wins" | "if-side-b-wins",
  result: NormalizedSettlement
): boolean {
  if (condition === "always") return true;
  return condition === "if-side-a-wins"
    ? result.sideAOutcome === "win"
    : result.sideBOutcome === "win";
}

function accumulatedEvidenceScore(
  scoreMode: "cumulative" | "per-game",
  rounds: Array<{
    round: {
      sideAScore: number | null;
      sideBScore: number | null;
    };
  }>
): { sideAScore: number; sideBScore: number } | null {
  if (
    rounds.length === 0 ||
    rounds.some(
      ({ round }) => round.sideAScore === null || round.sideBScore === null
    )
  ) {
    return null;
  }

  if (scoreMode === "cumulative") {
    const final = rounds.at(-1)!.round;
    return {
      sideAScore: final.sideAScore!,
      sideBScore: final.sideBScore!
    };
  }

  return rounds.reduce(
    (total, { round }) => ({
      sideAScore: total.sideAScore + round.sideAScore!,
      sideBScore: total.sideBScore + round.sideBScore!
    }),
    { sideAScore: 0, sideBScore: 0 }
  );
}

async function persistAppearancesAndAttributions(
  database: DatabaseExecutor,
  resultRevisionId: number,
  reviews: AppearanceReview[],
  actorAccountId: number
) {
  for (const review of reviews) {
    await database.insert(championshipMatchAppearances).values({
      resultRevisionId,
      sourcePlayerId: review.sourcePlayer.id,
      sourceAccountId: review.sourceAccount?.id ?? null,
      observedSide: review.observedSide,
      playingTimeSeconds: review.playingTimeSeconds,
      registered: review.registered,
      onRoster: review.onRoster,
      displayNameSnapshot: review.sourcePlayer.name,
      findings: Object.fromEntries(
        review.findings.map((finding) => [finding, true])
      )
    });
    await database.insert(championshipMatchAttributions).values({
      resultRevisionId,
      sourcePlayerId: review.sourcePlayer.id,
      mode: review.attribution.mode,
      targetParticipantId: review.attribution.targetParticipant?.id ?? null,
      actorAccountId,
      reason: review.attribution.reason
    });
  }
}

async function persistStatistics(
  database: DatabaseExecutor,
  championshipId: number,
  context: ChampionshipMatchContext,
  resultRevisionId: number,
  result: NormalizedSettlement,
  reviews: AppearanceReview[]
) {
  const teamEntries = [
    ...(context.match.sideATeamId
      ? teamStatistics(
          championshipId,
          resultRevisionId,
          context.match.sideATeamId,
          result.sideAOutcome,
          result.sideAPlayedScore,
          result.sideAAdministrativeScore,
          result.sideBOfficialScore
        )
      : []),
    ...(context.match.sideBTeamId
      ? teamStatistics(
          championshipId,
          resultRevisionId,
          context.match.sideBTeamId,
          result.sideBOutcome,
          result.sideBPlayedScore,
          result.sideBAdministrativeScore,
          result.sideAOfficialScore
        )
      : [])
  ];
  const playerBuckets = new Map<
    string,
    {
      participantId: number | null;
      sourcePlayerId: number;
      displayName: string;
      playingTimeSeconds: number;
    }
  >();

  for (const review of reviews) {
    if (review.attribution.mode === "exclude") continue;
    const participant =
      review.attribution.mode === "redirect"
        ? review.attribution.targetParticipant
        : review.participant;
    const key = participant
      ? `participant:${participant.id}`
      : `player:${review.sourcePlayer.id}`;
    const bucket = playerBuckets.get(key) ?? {
      participantId: participant?.id ?? null,
      sourcePlayerId: review.sourcePlayer.id,
      displayName: participant?.displayNameSnapshot ?? review.sourcePlayer.name,
      playingTimeSeconds: 0
    };
    bucket.playingTimeSeconds += review.playingTimeSeconds;
    playerBuckets.set(key, bucket);
  }

  const playerEntries = [...playerBuckets.values()].flatMap((bucket) => [
    {
      championshipId,
      resultRevisionId,
      participantId: bucket.participantId,
      sourcePlayerId: bucket.sourcePlayerId,
      displayNameSnapshot: bucket.displayName,
      teamId: null,
      sourceEventSchemaVersionId: null,
      sourceRoomProgramId: null,
      metricKey: "matches_played",
      numericValue: 1,
      source: "participation" as const
    },
    {
      championshipId,
      resultRevisionId,
      participantId: bucket.participantId,
      sourcePlayerId: bucket.sourcePlayerId,
      displayNameSnapshot: bucket.displayName,
      teamId: null,
      sourceEventSchemaVersionId: null,
      sourceRoomProgramId: null,
      metricKey: "playing_time_seconds",
      numericValue: bucket.playingTimeSeconds,
      source: "participation" as const
    }
  ]);

  const gameplayEntries = await deriveGameplayStatisticEntries(
    database,
    championshipId,
    resultRevisionId,
    context,
    reviews
  );

  if (teamEntries.length || playerEntries.length || gameplayEntries.length) {
    await database
      .insert(championshipStatisticEntries)
      .values([...teamEntries, ...playerEntries, ...gameplayEntries]);
  }
}

async function deriveGameplayStatisticEntries(
  database: DatabaseExecutor,
  championshipId: number,
  resultRevisionId: number,
  context: ChampionshipMatchContext,
  reviews: AppearanceReview[]
) {
  const evidenceRounds = await database
    .select({ round: championshipMatchEvidenceRounds })
    .from(championshipMatchEvidenceRounds)
    .innerJoin(
      championshipMatchEvidence,
      eq(
        championshipMatchEvidenceRounds.evidenceId,
        championshipMatchEvidence.id
      )
    )
    .where(eq(championshipMatchEvidence.championshipMatchId, context.match.id));
  const physicalMatchIds = evidenceRounds.map(
    ({ round }) => round.physicalMatchId
  );

  if (physicalMatchIds.length === 0) return [];
  const [physicalMatch] = await database
    .select()
    .from(matches)
    .where(inArray(matches.id, physicalMatchIds));
  if (!physicalMatch?.eventSchemaVersionId) return [];
  const [schemaVersion] = await database
    .select()
    .from(eventSchemaVersions)
    .where(eq(eventSchemaVersions.id, physicalMatch.eventSchemaVersionId));
  if (!schemaVersion) return [];

  const events = await listMatchEventsByMatchIds(physicalMatchIds, database);
  const metrics = deriveMatchMetrics(schemaVersion.definition, events);
  const programIds = new Set(
    evidenceRounds
      .map(({ round }) => round.roomProgramId)
      .filter((id): id is number => id !== null)
  );
  const sourceRoomProgramId =
    programIds.size === 1 ? [...programIds][0]! : null;
  const reviewByExternalId = new Map(
    reviews.map((review) => [review.sourcePlayer.externalId, review])
  );

  return metrics.flatMap((item) => {
    const review = reviewByExternalId.get(item.player.id);
    if (!review || review.attribution.mode === "exclude") return [];
    const participant =
      review.attribution.mode === "redirect"
        ? review.attribution.targetParticipant
        : review.participant;

    return Object.entries(item.metrics).flatMap(([metricKey, value]) =>
      typeof value === "number" && Number.isFinite(value)
        ? [
            {
              championshipId,
              resultRevisionId,
              participantId: participant?.id ?? null,
              sourcePlayerId: review.sourcePlayer.id,
              displayNameSnapshot:
                participant?.displayNameSnapshot ?? review.sourcePlayer.name,
              teamId: null,
              sourceEventSchemaVersionId: schemaVersion.id,
              sourceRoomProgramId,
              metricKey,
              numericValue: value,
              source: "gameplay" as const
            }
          ]
        : []
    );
  });
}

function teamStatistics(
  championshipId: number,
  resultRevisionId: number,
  teamId: number,
  outcome: Outcome,
  playedScore: number,
  administrativeScore: number,
  pointsAgainst: number
) {
  const officialScore = playedScore + administrativeScore;
  const common = {
    championshipId,
    resultRevisionId,
    participantId: null,
    sourcePlayerId: null,
    displayNameSnapshot: null,
    teamId,
    sourceEventSchemaVersionId: null,
    sourceRoomProgramId: null
  };

  return [
    metric(common, "matches_played", 1, "gameplay"),
    metric(common, outcomeMetric(outcome), 1, "gameplay"),
    metric(common, "points_for", playedScore, "gameplay"),
    metric(common, "points_for", administrativeScore, "administrative"),
    metric(common, "points_against", pointsAgainst, "gameplay"),
    metric(
      common,
      "score_differential",
      officialScore - pointsAgainst,
      administrativeScore > 0 ? "administrative" : "gameplay"
    )
  ];
}

function metric(
  common: {
    championshipId: number;
    resultRevisionId: number;
    participantId: null;
    sourcePlayerId: null;
    displayNameSnapshot: null;
    teamId: number;
    sourceEventSchemaVersionId: null;
    sourceRoomProgramId: null;
  },
  metricKey: string,
  numericValue: number,
  source: "gameplay" | "administrative"
) {
  return { ...common, metricKey, numericValue, source };
}

function outcomeMetric(outcome: Outcome) {
  return outcome === "win" ? "wins" : outcome === "draw" ? "draws" : "losses";
}

function sideForTeam(
  team: "red" | "blue",
  orientation: "aligned" | "swapped"
): Side {
  if (orientation === "aligned") {
    return team === "red" ? "a" : "b";
  }
  return team === "red" ? "b" : "a";
}

function toAppearanceResponse(review: AppearanceReview) {
  return {
    sourcePlayerId: review.sourcePlayer.externalId,
    sourceAccountUuid: review.sourceAccount?.uuid ?? null,
    displayName: review.sourcePlayer.name,
    observedSide: review.observedSide,
    playingTimeSeconds: review.playingTimeSeconds,
    registered: review.registered,
    onRoster: review.onRoster,
    findings: review.findings,
    attribution: {
      mode: review.attribution.mode,
      targetParticipantUuid: review.attribution.targetParticipant?.uuid ?? null,
      targetDisplayName:
        review.attribution.targetParticipant?.displayNameSnapshot ?? null,
      reason: review.attribution.reason
    }
  };
}

function toDownstreamResponse(impact: CascadeImpact) {
  return {
    matchUuid: impact.match.uuid,
    label: impact.match.label,
    depth: impact.depth,
    hadResult: impact.match.resultRevision > 0,
    hadEvidence: impact.match.evidenceRevision > 0,
    schedulePreserved: true
  };
}

async function teamReference(
  database: DatabaseExecutor,
  teamId: number | null
) {
  if (!teamId) return null;
  const [row] = await database
    .select({ team: championshipTeams, identity: championshipTeamIdentities })
    .from(championshipTeams)
    .leftJoin(
      championshipTeamIdentities,
      eq(championshipTeams.teamIdentityId, championshipTeamIdentities.id)
    )
    .where(eq(championshipTeams.id, teamId));

  return teamReferenceFromRow(row);
}

function teamReferenceFromRow(
  row:
    | {
        team: typeof championshipTeams.$inferSelect;
        identity: typeof championshipTeamIdentities.$inferSelect | null;
      }
    | undefined
) {
  if (!row) return null;
  return {
    uuid: row.team.uuid,
    name: row.team.name,
    abbreviation: row.team.abbreviation,
    colors: row.team.colors
  };
}

function hashPreview(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requireRevision(target: string, current: number, expected: number) {
  if (current !== expected) {
    throw conflict(`${target} revision does not match`, {
      expectedRevision: expected,
      currentRevision: current
    });
  }
}

function appearanceFindingLabel(finding: string) {
  switch (finding) {
    case "unregistered":
      return "jogador não registrado";
    case "off-roster":
      return "jogador fora do elenco";
    case "wrong-side":
      return "jogador registrado na equipe adversária";
    case "ambiguous-side":
      return "participação observada nos dois lados";
    default:
      return finding;
  }
}
