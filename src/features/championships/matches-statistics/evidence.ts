import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import {
  getChampionshipWithType,
  toTeamResponse
} from "@/features/championships/_shared/db/queries";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import { championshipRoomPrograms } from "@/features/championships/core/db";
import {
  championshipMatches,
  championshipSpots,
  championshipStages
} from "@/features/championships/format-scheduling/db";
import type {
  AttachChampionshipMatchEvidenceInput,
  ChampionshipEvidenceCandidatesQuery,
  DetachChampionshipMatchEvidenceInput
} from "@/features/championships/matches-statistics/inputs";
import {
  championshipMatchAppearances,
  championshipMatchAttributions,
  championshipMatchEvidence,
  championshipMatchEvidenceRounds,
  championshipMatchResultRevisions
} from "@/features/championships/matches-statistics/db";
import {
  championshipRoomContextRank,
  classifyChampionshipRoomContext
} from "@/features/championships/matches-statistics/room-context";
import { areProgramsCompatible } from "@/features/championships/matches-statistics/program-compatibility";
import { recommendEvidenceOrientation } from "@/features/championships/matches-statistics/evidence-orientation";
import type { ChampionshipMatchOperationsResponse } from "@/features/championships/matches-statistics/responses";
import {
  championshipParticipants,
  championshipTeamMemberships,
  championshipTeamIdentities,
  championshipTeams
} from "@/features/championships/people/db";
import {
  acquireLogicalMatchEvidenceClaim,
  releaseLogicalMatchEvidenceClaim
} from "@/features/matches/evidence-claims";
import { createMatchCompositionInTransaction } from "@/features/matches/create-match-composition";
import { listMatches } from "@/features/matches/list-matches";
import { readLogicalMatchEvidence } from "@/features/matches/read-logical-match-evidence";
import { resolveLogicalMatch } from "@/features/matches/resolve-logical-match";
import { players } from "@/features/players/db";
import { roomInstances, roomPrograms } from "@/features/rooms/core-db";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "@/shared/http/errors";

const evidenceConsumerKind = "championship-match";
const operationsLimit = 100;

export async function getChampionshipMatchOperations(
  championshipUuid: string,
  matchUuid: string,
  actorAccountUuid?: string
): Promise<ChampionshipMatchOperationsResponse> {
  const context = await requireMatchContext(db, championshipUuid, matchUuid);
  let staff = false;

  if (actorAccountUuid) {
    await requireChampionshipActor(db, {
      actorAccountUuid,
      championshipId: context.championship.id,
      permission: ["championship:admin", "championship:operate"]
    });
    staff = true;
  } else if (context.championship.visibility !== "public") {
    throw forbidden(
      "Private championship match operations require staff access"
    );
  }

  return projectChampionshipMatchOperations(db, context, staff);
}

export async function listChampionshipEvidenceCandidates(
  championshipUuid: string,
  matchUuid: string,
  query: ChampionshipEvidenceCandidatesQuery
) {
  const context = await requireMatchContext(db, championshipUuid, matchUuid);
  await requireChampionshipActor(db, {
    actorAccountUuid: query.actorAccountUuid,
    championshipId: context.championship.id,
    permission: ["championship:admin", "championship:operate"]
  });
  const expectedProgram = await resolveExpectedProgram(
    db,
    context.championship.id,
    context.match
  );
  const allowedPrograms = new Set(
    (await resolveAllowedPrograms(db, context.championship.id)).map(
      (program) => program.uuid
    )
  );
  const limit = query.limit ?? 20;
  const rosterByAccountUuid = await resolveCurrentRosterByAccountUuid(
    db,
    context.championship.id
  );
  const summaries = query.logicalMatchId
    ? { items: [{ id: query.logicalMatchId }], page: { nextCursor: null } }
    : await listMatches({ limit, cursor: query.cursor });
  const candidates = [];

  for (const summary of summaries.items) {
    const evidence = await readLogicalMatchEvidence(summary.id, {
      eventLimit: 1,
      participantLimit: 100
    });
    const actualPrograms = new Set(
      evidence.rounds
        .map((round) => round.provenance?.program.uuid)
        .filter((uuid): uuid is string => !!uuid)
    );
    const programCompatible = areProgramsCompatible(
      actualPrograms,
      allowedPrograms
    );
    const championshipContext = classifyChampionshipRoomContext(
      championshipUuid,
      evidence.rounds.map((round) => round.provenance?.championshipContextUuid)
    );
    const initiatedAt = evidence.rounds[0]?.initiatedAt;
    const totalScore = evidence.score
      ? evidence.score.red + evidence.score.blue
      : null;
    const playerSearch = query.playerSearch?.trim().toLocaleLowerCase();
    const logicalMatchSearch = normalizeLogicalMatchSearch(playerSearch);
    const logicalMatchMatches =
      !!logicalMatchSearch && evidence.id.includes(logicalMatchSearch);
    const playerMatches =
      !playerSearch ||
      logicalMatchMatches ||
      evidence.rounds.some((round) =>
        round.participants.items.some(
          ({ player }) =>
            player.id.toLocaleLowerCase().includes(playerSearch) ||
            player.name.toLocaleLowerCase().includes(playerSearch) ||
            player.account?.name.toLocaleLowerCase().includes(playerSearch)
        )
      );
    const initiatedMatches =
      (!query.initiatedFrom ||
        (!!initiatedAt && initiatedAt >= query.initiatedFrom)) &&
      (!query.initiatedTo ||
        (!!initiatedAt && initiatedAt <= query.initiatedTo));
    const scoreMatches =
      (query.minimumTotalScore === undefined ||
        (totalScore !== null && totalScore >= query.minimumTotalScore)) &&
      (query.maximumTotalScore === undefined ||
        (totalScore !== null && totalScore <= query.maximumTotalScore));
    const qualityMatches = !query.quality || evidence.quality === query.quality;
    const claimMatches =
      !query.claimState ||
      query.claimState === "all" ||
      (query.claimState === "claimed"
        ? evidence.claim !== null
        : evidence.claim === null);

    if (
      evidence.eligible &&
      playerMatches &&
      initiatedMatches &&
      scoreMatches &&
      qualityMatches &&
      claimMatches &&
      (query.includeAllPrograms ||
        programCompatible ||
        query.logicalMatchId ||
        logicalMatchMatches)
    ) {
      candidates.push({
        evidence,
        expectedProgram: expectedProgram
          ? { uuid: expectedProgram.uuid, name: expectedProgram.name }
          : null,
        programCompatible,
        orientationRecommendation: recommendEvidenceOrientation(
          evidence.rounds,
          context.match,
          rosterByAccountUuid
        ),
        championshipContext,
        alreadyClaimed: evidence.claim !== null
      });
    }
  }

  return {
    items: candidates
      .sort(
        (left, right) =>
          championshipRoomContextRank(left.championshipContext) -
          championshipRoomContextRank(right.championshipContext)
      )
      .slice(0, limit),
    nextCursor: query.logicalMatchId ? null : summaries.page.nextCursor,
    totalInspected: summaries.items.length
  };
}

async function resolveCurrentRosterByAccountUuid(
  database: DatabaseExecutor,
  championshipId: number
) {
  const rows = await database
    .select({
      accountUuid: accounts.uuid,
      teamId: championshipTeamMemberships.teamId
    })
    .from(championshipTeamMemberships)
    .innerJoin(
      championshipParticipants,
      eq(championshipTeamMemberships.participantId, championshipParticipants.id)
    )
    .innerJoin(accounts, eq(championshipParticipants.accountId, accounts.id))
    .where(
      and(
        eq(championshipTeamMemberships.championshipId, championshipId),
        isNull(championshipTeamMemberships.endedAt)
      )
    );

  return new Map(rows.map((row) => [row.accountUuid, row.teamId]));
}

function normalizeLogicalMatchSearch(search?: string): string | null {
  if (!search) {
    return null;
  }

  const normalized = search.replace(/[\s_-]+/g, "");

  return /^[a-z2-9]{3,9}$/.test(normalized) ? normalized : null;
}

export async function attachChampionshipMatchEvidence(
  championshipUuid: string,
  matchUuid: string,
  input: AttachChampionshipMatchEvidenceInput
): Promise<ChampionshipMatchOperationsResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "match.evidence.attached"
    },
    async (tx, championship, actor) => {
      const context = await requireMatchContext(
        tx,
        championshipUuid,
        matchUuid
      );
      requireLocalRevision(
        "evidence",
        context.match.evidenceRevision,
        input.expectedEvidenceRevision
      );
      const [existingEvidence] = await tx
        .select()
        .from(championshipMatchEvidence)
        .where(
          eq(championshipMatchEvidence.championshipMatchId, context.match.id)
        );

      if (existingEvidence) {
        throw conflict("Championship match already has evidence attached");
      }

      if (!!input.logicalMatchId === !!input.composition) {
        throw badRequest(
          "Provide either a logical match or a physical-game composition"
        );
      }

      const logicalMatchId = input.composition
        ? (
            await createMatchCompositionInTransaction(
              {
                scoreMode: "last-round",
                rounds: input.composition.rounds
              },
              tx
            )
          ).publicId
        : input.logicalMatchId;

      if (!logicalMatchId) {
        throw new Error("Validated evidence source is missing");
      }
      const logicalMatch = await resolveLogicalMatch(logicalMatchId, tx);

      if (
        logicalMatch.rounds.some((round) => round.match.status !== "completed")
      ) {
        throw conflict("Only completed logical matches can become evidence");
      }

      await acquireLogicalMatchEvidenceClaim(tx, logicalMatch, {
        kind: evidenceConsumerKind,
        uuid: context.match.uuid
      });
      const normalized = await readLogicalMatchEvidence(
        logicalMatch.publicId,
        { eventLimit: 1, participantLimit: operationsLimit },
        tx
      );
      const quality = normalizeEvidenceQuality(normalized.quality);
      const [evidence] = await tx
        .insert(championshipMatchEvidence)
        .values({
          championshipMatchId: context.match.id,
          physicalMatchId:
            logicalMatch.kind === "single" ? logicalMatch.firstMatch.id : null,
          composedMatchId:
            logicalMatch.kind === "composed"
              ? logicalMatch.composition.id
              : null,
          logicalPublicIdSnapshot: logicalMatch.publicId,
          scoreMode: normalized.scoreMode,
          orientation: input.orientation,
          quality,
          attachedByAccountId: actor.account.id,
          note: input.note ?? null
        })
        .returning();
      const sourceRoomIds = logicalMatch.rounds
        .map((round) => round.match.roomInstanceId)
        .filter((id): id is number => id !== null);
      const sourceRooms = sourceRoomIds.length
        ? await tx
            .select()
            .from(roomInstances)
            .where(inArray(roomInstances.id, sourceRoomIds))
        : [];
      const roomById = new Map(sourceRooms.map((room) => [room.id, room]));

      await tx.insert(championshipMatchEvidenceRounds).values(
        logicalMatch.rounds.map((round, index) => {
          const projected = normalized.rounds[index]!;
          const score = projectScoreToChampionshipSide(
            projected.normalizedScore,
            input.orientation
          );
          const room = round.match.roomInstanceId
            ? roomById.get(round.match.roomInstanceId)
            : null;

          return {
            evidenceId: evidence.id,
            physicalMatchId: round.match.id,
            position: index + 1,
            kind: round.reference.kind,
            orientation: combineOrientations(
              round.reference.orientation,
              input.orientation
            ),
            sideAScore: score?.a ?? null,
            sideBScore: score?.b ?? null,
            completionReason: round.match.completionReason,
            elapsedSeconds: round.match.elapsedSeconds,
            lastCheckpointAt: round.match.lastCheckpointAt,
            recordingState: !round.match.recordingId
              ? ("missing" as const)
              : projected.recording?.validation === "invalid" ||
                  projected.recording?.validation === "unsupported"
                ? ("invalid" as const)
                : ("available" as const),
            roomProgramId: room?.programId ?? null,
            roomProgramVersionId: room?.versionId ?? null
          };
        })
      );
      const [updatedMatch] = await tx
        .update(championshipMatches)
        .set({
          evidenceRevision: context.match.evidenceRevision + 1,
          revision: context.match.revision + 1,
          updatedAt: new Date().toISOString()
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
        before: null,
        after: {
          logicalMatchId: logicalMatch.publicId,
          orientation: input.orientation,
          quality
        },
        reason: input.note ?? null,
        metadata: {
          physicalRoundCount: logicalMatch.rounds.length,
          compositionCreated: !!input.composition
        }
      };
    }
  );
}

export async function detachChampionshipMatchEvidence(
  championshipUuid: string,
  matchUuid: string,
  input: DetachChampionshipMatchEvidenceInput
): Promise<ChampionshipMatchOperationsResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "match.evidence.detached"
    },
    async (tx, championship) => {
      const context = await requireMatchContext(
        tx,
        championshipUuid,
        matchUuid
      );
      requireLocalRevision(
        "evidence",
        context.match.evidenceRevision,
        input.expectedEvidenceRevision
      );
      const [evidence] = await tx
        .select()
        .from(championshipMatchEvidence)
        .where(
          eq(championshipMatchEvidence.championshipMatchId, context.match.id)
        );

      if (evidence) {
        await tx
          .delete(championshipMatchEvidenceRounds)
          .where(eq(championshipMatchEvidenceRounds.evidenceId, evidence.id));
        await tx
          .delete(championshipMatchEvidence)
          .where(eq(championshipMatchEvidence.id, evidence.id));
      }
      await releaseLogicalMatchEvidenceClaim(tx, {
        kind: evidenceConsumerKind,
        uuid: context.match.uuid
      });
      const [updatedMatch] = await tx
        .update(championshipMatches)
        .set({
          evidenceRevision: context.match.evidenceRevision + 1,
          revision: context.match.revision + 1,
          updatedAt: new Date().toISOString()
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
        before: evidence
          ? { logicalMatchId: evidence.logicalPublicIdSnapshot }
          : null,
        after: null,
        reason: input.reason
      };
    }
  );
}

export type ChampionshipMatchContext = Awaited<
  ReturnType<typeof requireMatchContext>
>;

export async function requireMatchContext(
  database: DatabaseExecutor,
  championshipUuid: string,
  matchUuid: string
) {
  const row = await getChampionshipWithType(database, championshipUuid);
  const [match] = await database
    .select()
    .from(championshipMatches)
    .where(
      and(
        eq(championshipMatches.uuid, matchUuid),
        eq(championshipMatches.championshipId, row.championship.id)
      )
    );

  if (!match) {
    throw notFound("Championship match not found");
  }

  const [stage, sideASpot, sideBSpot] = await Promise.all([
    database
      .select()
      .from(championshipStages)
      .where(eq(championshipStages.id, match.stageId))
      .then((rows) => rows[0]),
    database
      .select()
      .from(championshipSpots)
      .where(eq(championshipSpots.id, match.sideASpotId))
      .then((rows) => rows[0]),
    database
      .select()
      .from(championshipSpots)
      .where(eq(championshipSpots.id, match.sideBSpotId))
      .then((rows) => rows[0])
  ]);

  if (!stage || !sideASpot || !sideBSpot) {
    throw new Error("Championship match graph references are missing");
  }

  return {
    championship: row.championship,
    competitionType: row.competitionType,
    match,
    stage,
    sideASpot,
    sideBSpot
  };
}

export async function projectChampionshipMatchOperations(
  database: DatabaseExecutor,
  context: ChampionshipMatchContext,
  staff: boolean
): Promise<ChampionshipMatchOperationsResponse> {
  const [evidence, expectedProgram, resultRows, resultCountRows] =
    await Promise.all([
      database
        .select()
        .from(championshipMatchEvidence)
        .where(
          eq(championshipMatchEvidence.championshipMatchId, context.match.id)
        )
        .then((rows) => rows[0] ?? null),
      resolveExpectedProgram(database, context.championship.id, context.match),
      database
        .select()
        .from(championshipMatchResultRevisions)
        .where(
          eq(
            championshipMatchResultRevisions.championshipMatchId,
            context.match.id
          )
        )
        .orderBy(desc(championshipMatchResultRevisions.revision))
        .limit(operationsLimit + 1),
      database
        .select({ value: count() })
        .from(championshipMatchResultRevisions)
        .where(
          eq(
            championshipMatchResultRevisions.championshipMatchId,
            context.match.id
          )
        )
    ]);
  const resultCount = resultCountRows[0]?.value ?? 0;
  const currentResult =
    resultRows.find((result) => result.state === "current") ?? null;
  const canExposeEvidence = staff || currentResult !== null;
  const normalizedEvidence =
    evidence && canExposeEvidence
      ? await readLogicalMatchEvidence(
          evidence.logicalPublicIdSnapshot,
          { eventLimit: staff ? 100 : 20, participantLimit: operationsLimit },
          database
        )
      : null;
  const teamIds = [context.match.sideATeamId, context.match.sideBTeamId].filter(
    (id): id is number => id !== null
  );
  const teamRows = teamIds.length
    ? await database
        .select({
          team: championshipTeams,
          identity: championshipTeamIdentities
        })
        .from(championshipTeams)
        .leftJoin(
          championshipTeamIdentities,
          eq(championshipTeams.teamIdentityId, championshipTeamIdentities.id)
        )
        .where(inArray(championshipTeams.id, teamIds))
    : [];
  const teamById = new Map(teamRows.map((row) => [row.team.id, row]));
  const appearances =
    currentResult && canExposeEvidence
      ? await readAppearances(database, currentResult.id)
      : { items: [], totalCount: 0 };

  return {
    championshipUuid: context.championship.uuid,
    championshipRevision: context.championship.revision,
    match: {
      uuid: context.match.uuid,
      label: context.match.label,
      sideA: teamReference(teamById.get(context.match.sideATeamId ?? -1)),
      sideB: teamReference(teamById.get(context.match.sideBTeamId ?? -1)),
      scheduledAt: context.match.scheduledAt,
      scheduleStatus: context.match.scheduleStatus,
      expectedProgram: expectedProgram
        ? { uuid: expectedProgram.uuid, name: expectedProgram.name }
        : null,
      evidenceRevision: context.match.evidenceRevision,
      resultRevision: context.match.resultRevision,
      scheduleRevision: context.match.scheduleRevision,
      revision: context.match.revision
    },
    evidence: normalizedEvidence,
    evidenceNote: canExposeEvidence ? (evidence?.note ?? null) : null,
    evidenceOrientation: canExposeEvidence
      ? (evidence?.orientation ?? null)
      : null,
    result: currentResult ? toResultResponse(currentResult) : null,
    appearances: {
      items: appearances.items,
      totalCount: appearances.totalCount,
      truncated: appearances.totalCount > operationsLimit
    },
    resultHistory: {
      items: resultRows.slice(0, operationsLimit).map(toResultResponse),
      totalCount: resultCount,
      truncated: resultCount > operationsLimit
    }
  };
}

async function readAppearances(
  database: DatabaseExecutor,
  resultRevisionId: number
) {
  const [rows, countRows] = await Promise.all([
    database
      .select({
        appearance: championshipMatchAppearances,
        player: players,
        sourceAccount: accounts,
        attribution: championshipMatchAttributions,
        targetParticipant: championshipParticipants
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
      .leftJoin(
        championshipMatchAttributions,
        and(
          eq(
            championshipMatchAttributions.resultRevisionId,
            championshipMatchAppearances.resultRevisionId
          ),
          eq(
            championshipMatchAttributions.sourcePlayerId,
            championshipMatchAppearances.sourcePlayerId
          )
        )
      )
      .leftJoin(
        championshipParticipants,
        eq(
          championshipMatchAttributions.targetParticipantId,
          championshipParticipants.id
        )
      )
      .where(
        eq(championshipMatchAppearances.resultRevisionId, resultRevisionId)
      )
      .orderBy(asc(championshipMatchAppearances.id))
      .limit(operationsLimit),
    database
      .select({ value: count() })
      .from(championshipMatchAppearances)
      .where(
        eq(championshipMatchAppearances.resultRevisionId, resultRevisionId)
      )
  ]);

  return {
    items: rows.map((row) => ({
      sourcePlayerId: row.player.externalId,
      sourceAccountUuid: row.sourceAccount?.uuid ?? null,
      displayName: row.appearance.displayNameSnapshot,
      observedSide: row.appearance.observedSide,
      playingTimeSeconds: row.appearance.playingTimeSeconds,
      registered: row.appearance.registered,
      onRoster: row.appearance.onRoster,
      findings: Object.keys(row.appearance.findings).filter(
        (key) => row.appearance.findings[key]
      ),
      attribution: {
        mode: row.attribution?.mode ?? ("default" as const),
        targetParticipantUuid: row.targetParticipant?.uuid ?? null,
        targetDisplayName: row.targetParticipant?.displayNameSnapshot ?? null,
        reason: row.attribution?.reason ?? null
      }
    })),
    totalCount: countRows[0]?.value ?? 0
  };
}

export async function resolveExpectedProgram(
  database: DatabaseExecutor,
  championshipId: number,
  match: typeof championshipMatches.$inferSelect
) {
  let programId = match.roomProgramId;

  if (!programId) {
    const [stage] = await database
      .select()
      .from(championshipStages)
      .where(eq(championshipStages.id, match.stageId));

    if (stage?.defaultChampionshipRoomProgramId) {
      const [association] = await database
        .select()
        .from(championshipRoomPrograms)
        .where(
          eq(
            championshipRoomPrograms.id,
            stage.defaultChampionshipRoomProgramId
          )
        );
      programId = association?.roomProgramId ?? null;
    }
  }

  if (!programId) {
    const [association] = await database
      .select()
      .from(championshipRoomPrograms)
      .where(
        and(
          eq(championshipRoomPrograms.championshipId, championshipId),
          eq(championshipRoomPrograms.isDefault, true)
        )
      );
    programId = association?.roomProgramId ?? null;
  }

  if (!programId) {
    return null;
  }

  const [program] = await database
    .select()
    .from(roomPrograms)
    .where(eq(roomPrograms.id, programId));

  return program ?? null;
}

export async function resolveAllowedPrograms(
  database: DatabaseExecutor,
  championshipId: number
) {
  return database
    .select({
      id: roomPrograms.id,
      uuid: roomPrograms.uuid,
      name: roomPrograms.name,
      title: roomPrograms.title
    })
    .from(championshipRoomPrograms)
    .innerJoin(
      roomPrograms,
      eq(championshipRoomPrograms.roomProgramId, roomPrograms.id)
    )
    .where(
      and(
        eq(championshipRoomPrograms.championshipId, championshipId),
        eq(championshipRoomPrograms.state, "active")
      )
    );
}

function teamReference(
  row:
    | {
        team: typeof championshipTeams.$inferSelect;
        identity: typeof championshipTeamIdentities.$inferSelect | null;
      }
    | undefined
) {
  if (!row) {
    return null;
  }
  const team = toTeamResponse(row.team, row.identity);

  return {
    uuid: team.uuid,
    name: team.name,
    abbreviation: team.abbreviation,
    colors: team.colors
  };
}

function toResultResponse(
  result: typeof championshipMatchResultRevisions.$inferSelect
) {
  return {
    uuid: result.uuid,
    revision: result.revision,
    state: result.state,
    method: result.method,
    sideAPlayedScore: result.sideAPlayedScore,
    sideBPlayedScore: result.sideBPlayedScore,
    sideAAdministrativeScore: result.sideAAdministrativeScore,
    sideBAdministrativeScore: result.sideBAdministrativeScore,
    sideAOfficialScore: result.sideAOfficialScore,
    sideBOfficialScore: result.sideBOfficialScore,
    sideAOutcome: result.sideAOutcome,
    sideBOutcome: result.sideBOutcome,
    evidenceDerived: result.evidenceDerived,
    note: result.note,
    settledAt: result.settledAt,
    supersededAt: result.supersededAt
  };
}

function requireLocalRevision(
  target: string,
  current: number,
  expected: number
) {
  if (current !== expected) {
    throw conflict(`${target} revision does not match`, {
      expectedRevision: expected,
      currentRevision: current
    });
  }
}

function normalizeEvidenceQuality(
  quality: "complete" | "recovered" | "partial" | "legacy" | "ineligible"
): "complete" | "recovered" | "partial" | "historical" | "unknown" {
  if (quality === "legacy") return "historical";
  if (quality === "ineligible") return "unknown";
  return quality;
}

function projectScoreToChampionshipSide(
  score: { red: number; blue: number } | null,
  orientation: "aligned" | "swapped"
) {
  if (!score) return null;

  return orientation === "aligned"
    ? { a: score.red, b: score.blue }
    : { a: score.blue, b: score.red };
}

function combineOrientations(
  round: "aligned" | "swapped",
  evidence: "aligned" | "swapped"
): "aligned" | "swapped" {
  return round === evidence ? "aligned" : "swapped";
}

export function championshipEvidenceConsumer(matchUuid: string) {
  return { kind: evidenceConsumerKind, uuid: matchUuid };
}
