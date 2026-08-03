import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type DatabaseExecutor, type DbTransaction } from "@/db/client";
import type {
  ApplyChampionshipClassificationInput,
  ChampionshipStandingsQuery,
  ConfigureChampionshipStandingsInput,
  CreateChampionshipGroupInput,
  GenerateChampionshipRoundRobinInput,
  PreviewChampionshipClassificationInput,
  PreviewChampionshipRoundRobinInput
} from "@/features/championships/_shared/http/inputs";
import type {
  ChampionshipFormatResponse,
  ChampionshipRoundRobinPreviewResponse,
  ChampionshipStandingsResponse
} from "@/features/championships/_shared/http/responses";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  championshipRoomPrograms,
  championships,
  type Championship
} from "@/features/championships/core/db";
import {
  championshipClassificationRules,
  championshipClassificationRuns,
  championshipCompetitionRounds,
  championshipGroups,
  championshipMatches,
  championshipProgressionRoutes,
  championshipSpots,
  championshipStages
} from "@/features/championships/format-scheduling/db";
import { projectChampionshipFormat } from "@/features/championships/format-scheduling/operations";
import {
  invalidateChampionshipDownstreamMatches,
  placeTeamIntoChampionshipSpot
} from "@/features/championships/format-scheduling/progression";
import {
  generateRoundRobinPlan,
  type RoundRobinPairOverride
} from "@/features/championships/format-scheduling/round-robin-engine";
import {
  calculateStandings,
  type StandingsRule,
  type StandingsScoring,
  type StandingsVisibleMetric
} from "@/features/championships/format-scheduling/standings-engine";
import { calculateCorrectionCascade } from "@/features/championships/matches-statistics/cascade";
import { championshipMatchResultRevisions } from "@/features/championships/matches-statistics/db";
import { championshipTeams } from "@/features/championships/people/db";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "@/shared/http/errors";

type StandingsProjection = {
  response: ChampionshipStandingsResponse;
  placements: Array<{
    routeUuid: string;
    destinationSpotId: number;
    nextTeamId: number;
    changed: boolean;
  }>;
};

const defaultScoring: StandingsScoring = {
  mode: "points",
  win: 3,
  draw: 1,
  loss: 0
};

const resultsScoring: StandingsScoring = {
  mode: "results",
  win: null,
  draw: null,
  loss: null
};

const defaultVisibleMetrics: StandingsVisibleMetric[] = [
  "played",
  "wins",
  "draws",
  "losses",
  "score-for",
  "score-against",
  "score-difference",
  "points"
];

const defaultRules: StandingsRule[] = [
  { criterion: "points", direction: "desc" },
  { criterion: "wins", direction: "desc" },
  { criterion: "score-difference", direction: "desc" },
  { criterion: "score-for", direction: "desc" },
  { criterion: "head-to-head-points", direction: "desc" },
  { criterion: "head-to-head-score-difference", direction: "desc" }
];

const resultsDefaultRules: StandingsRule[] = [
  { criterion: "wins", direction: "desc" },
  { criterion: "score-difference", direction: "desc" },
  { criterion: "score-for", direction: "desc" },
  { criterion: "head-to-head-score-difference", direction: "desc" }
];

export async function createChampionshipGroup(
  championshipUuid: string,
  stageUuid: string,
  input: CreateChampionshipGroupInput
): Promise<ChampionshipFormatResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "format.group.created"
    },
    async (tx, championship) => {
      const stage = await requireStandingsStage(tx, championship.id, stageUuid);
      requireRevision("stage", stage.revision, input.expectedStageRevision);
      const teams = await resolveTeams(
        tx,
        championship.id,
        input.teamIds ?? []
      );
      await assertTeamsAreNotAlreadyGrouped(
        tx,
        stage.id,
        teams.map((team) => team.id)
      );
      const displayOrder =
        input.displayOrder ?? (await nextGroupDisplayOrder(tx, stage.id));
      const now = new Date().toISOString();
      const [group] = await tx
        .insert(championshipGroups)
        .values({
          stageId: stage.id,
          name: input.name,
          displayOrder,
          createdAt: now,
          updatedAt: now
        })
        .returning();
      const firstSpotOrder = await nextSpotDisplayOrder(tx, stage.id);

      if (teams.length > 0) {
        await tx.insert(championshipSpots).values(
          teams.map((team, index) => ({
            championshipId: championship.id,
            stageId: stage.id,
            groupId: group.id,
            key: `group-${group.uuid}-team-${team.uuid}`,
            label: `${group.name} · ${team.name}`,
            kind: "group-entry" as const,
            displayOrder: firstSpotOrder + index,
            currentTeamId: team.id,
            createdAt: now,
            updatedAt: now
          }))
        );
      }
      await bumpStageRevision(tx, stage.id, stage.revision, now);
      const response = await projectChampionshipFormat(tx, championship);

      return {
        response: () => response,
        targetType: "group",
        targetUuid: group.uuid,
        before: null,
        after: {
          name: group.name,
          displayOrder: group.displayOrder,
          teamUuids: teams.map((team) => team.uuid)
        }
      };
    }
  );
}

export async function configureChampionshipStandings(
  championshipUuid: string,
  stageUuid: string,
  input: ConfigureChampionshipStandingsInput
): Promise<ChampionshipFormatResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "format.standings.configured"
    },
    async (tx, championship) => {
      const stage = await requireStandingsStage(tx, championship.id, stageUuid);
      requireRevision("stage", stage.revision, input.expectedStageRevision);
      const scoring = normalizeScoring(input.scoring);
      validateClassificationRules(input.rules, scoring.mode);
      validateVisibleMetrics(input.visibleMetrics, scoring.mode);
      const visibleMetrics = normalizeVisibleMetrics(
        input.visibleMetrics,
        scoring.mode
      );
      const beforeRules = await tx
        .select()
        .from(championshipClassificationRules)
        .where(eq(championshipClassificationRules.stageId, stage.id))
        .orderBy(asc(championshipClassificationRules.position));
      await tx
        .delete(championshipClassificationRules)
        .where(eq(championshipClassificationRules.stageId, stage.id));
      await tx.insert(championshipClassificationRules).values(
        input.rules.map((rule, position) => ({
          stageId: stage.id,
          position,
          criterion: rule.criterion,
          direction: rule.direction,
          config: rule.config ?? null
        }))
      );
      const now = new Date().toISOString();
      await tx
        .update(championshipStages)
        .set({
          config: {
            ...stage.config,
            standingsScoring: scoring,
            standingsVisibleMetrics: visibleMetrics,
            headToHeadRestart: input.headToHeadRestart
          },
          revision: stage.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipStages.id, stage.id));
      const response = await projectChampionshipFormat(tx, championship);

      return {
        response: () => response,
        targetType: "stage",
        targetUuid: stage.uuid,
        before: {
          scoring: standingsScoring(stage.config),
          visibleMetrics: standingsVisibleMetrics(
            stage.config,
            standingsScoring(stage.config).mode
          ),
          headToHeadRestart: standingsRestart(stage.config),
          rules: beforeRules
        },
        after: {
          scoring,
          visibleMetrics,
          headToHeadRestart: input.headToHeadRestart,
          rules: input.rules
        }
      };
    }
  );
}

export async function getChampionshipStandings(
  championshipUuid: string,
  stageUuid: string,
  groupUuid: string,
  query: ChampionshipStandingsQuery = {}
): Promise<ChampionshipStandingsResponse> {
  const championship = await requireChampionship(db, championshipUuid);

  if (championship.visibility !== "public") {
    if (!query.actorAccountUuid) {
      throw forbidden("Private championship standings require staff access");
    }
    await requireChampionshipActor(db, {
      actorAccountUuid: query.actorAccountUuid,
      championshipId: championship.id,
      permission: ["championship:admin", "championship:operate"]
    });
  }

  return (
    await buildStandingsProjection(db, championship, stageUuid, groupUuid)
  ).response;
}

export async function previewChampionshipClassification(
  championshipUuid: string,
  stageUuid: string,
  groupUuid: string,
  input: PreviewChampionshipClassificationInput
): Promise<ChampionshipStandingsResponse> {
  const championship = await requireChampionship(db, championshipUuid);
  await requireChampionshipActor(db, {
    actorAccountUuid: input.actorAccountUuid,
    championshipId: championship.id,
    permission: ["championship:admin", "championship:operate"]
  });

  return (
    await buildStandingsProjection(db, championship, stageUuid, groupUuid)
  ).response;
}

export async function applyChampionshipClassification(
  championshipUuid: string,
  stageUuid: string,
  groupUuid: string,
  input: ApplyChampionshipClassificationInput
): Promise<ChampionshipStandingsResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "format.classification.applied"
    },
    async (tx, championship, actor) => {
      const stage = await requireStandingsStage(tx, championship.id, stageUuid);
      requireRevision("stage", stage.revision, input.expectedStageRevision);
      const projection = await buildStandingsProjection(
        tx,
        championship,
        stageUuid,
        groupUuid
      );

      if (!projection.response.canApply) {
        throw conflict(
          "Classification contains unresolved qualification ties",
          {
            unresolvedTies: projection.response.unresolvedTies,
            qualification: projection.response.qualification.filter(
              (route) => route.blocked
            )
          }
        );
      }
      assertConfirmedImpact(
        input.confirmedImpactMatchUuids,
        projection.response.affectedMatches.map((match) => match.matchUuid)
      );
      const now = new Date().toISOString();
      await invalidateChampionshipDownstreamMatches(
        tx,
        championship.id,
        projection.response.affectedMatches.map((match) => match.matchUuid),
        now
      );

      for (const placement of projection.placements) {
        await placeTeamIntoChampionshipSpot(
          tx,
          placement.destinationSpotId,
          placement.nextTeamId,
          now
        );
      }
      const nextStageRevision = stage.revision + 1;
      await bumpStageRevision(tx, stage.id, stage.revision, now);
      const group = await requireGroup(tx, stage.id, groupUuid);
      const [run] = await tx
        .insert(championshipClassificationRuns)
        .values({
          stageId: stage.id,
          groupId: group.id,
          revision: nextStageRevision,
          status:
            projection.response.unresolvedTies.length > 0
              ? "unresolved-tie"
              : "resolved",
          input: {
            scoring: projection.response.scoring,
            headToHeadRestart: projection.response.headToHeadRestart,
            rules: projection.response.rules,
            resultRevision: championship.revision
          },
          result: {
            rows: projection.response.rows,
            qualification: projection.response.qualification,
            affectedMatches: projection.response.affectedMatches
          },
          createdByAccountId: actor.account.id,
          createdAt: now
        })
        .returning();
      const response = (
        await buildStandingsProjection(tx, championship, stageUuid, groupUuid)
      ).response;

      return {
        response: () => response,
        targetType: "classification-run",
        targetUuid: run.uuid,
        before: {
          qualification: projection.response.qualification.map((route) => ({
            routeUuid: route.routeUuid,
            teamUuid: route.previousTeam?.uuid ?? null
          }))
        },
        after: {
          qualification: projection.response.qualification.map((route) => ({
            routeUuid: route.routeUuid,
            teamUuid: route.nextTeam?.uuid ?? null
          }))
        },
        metadata: {
          affectedMatchUuids: input.confirmedImpactMatchUuids
        }
      };
    }
  );
}

export async function previewChampionshipRoundRobin(
  championshipUuid: string,
  stageUuid: string,
  input: PreviewChampionshipRoundRobinInput
): Promise<ChampionshipRoundRobinPreviewResponse> {
  const championship = await requireChampionship(db, championshipUuid);
  await requireChampionshipActor(db, {
    actorAccountUuid: input.actorAccountUuid,
    championshipId: championship.id,
    permission: ["championship:admin", "championship:operate"]
  });
  const stage = await requireStandingsStage(db, championship.id, stageUuid);

  return buildRoundRobinPreview(db, championship, stage, input);
}

export async function generateChampionshipRoundRobin(
  championshipUuid: string,
  stageUuid: string,
  input: GenerateChampionshipRoundRobinInput
): Promise<ChampionshipFormatResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "format.round-robin.generated"
    },
    async (tx, championship) => {
      const stage = await requireStandingsStage(tx, championship.id, stageUuid);
      requireRevision("stage", stage.revision, input.expectedStageRevision);
      const preview = await buildRoundRobinPreview(
        tx,
        championship,
        stage,
        input
      );
      const context = await loadRoundRobinContext(
        tx,
        championship,
        stage,
        input
      );
      const missing = context.plan.pairings.filter(
        (pairing) => !pairing.existing
      );
      if (context.plan.desiredMatchCount > 500) {
        throw badRequest(
          "Round-robin generation is limited to 500 desired matches per stage"
        );
      }
      const teamById = new Map(context.teams.map((team) => [team.id, team]));
      const groupByUuid = new Map(
        context.groups.map((group) => [group.uuid, group])
      );
      const roundByUuid = new Map(
        context.rounds.map((round) => [round.uuid, round])
      );
      const [association] = stage.defaultChampionshipRoomProgramId
        ? await tx
            .select()
            .from(championshipRoomPrograms)
            .where(
              eq(
                championshipRoomPrograms.id,
                stage.defaultChampionshipRoomProgramId
              )
            )
        : [];
      let displayOrder = await nextMatchDisplayOrder(tx, stage.id);
      let spotOrder = await nextSpotDisplayOrder(tx, stage.id);
      const now = new Date().toISOString();

      for (const [index, pairing] of missing.entries()) {
        const sideA = teamById.get(pairing.sideATeamId)!;
        const sideB = teamById.get(pairing.sideBTeamId)!;
        const [sideASpot, sideBSpot] = await tx
          .insert(championshipSpots)
          .values([
            {
              championshipId: championship.id,
              stageId: stage.id,
              key: `round-robin-${input.commandUuid}-${index}-a`,
              label: `${sideA.name} · lado A`,
              kind: "match-side",
              displayOrder: spotOrder,
              currentTeamId: sideA.id,
              createdAt: now,
              updatedAt: now
            },
            {
              championshipId: championship.id,
              stageId: stage.id,
              key: `round-robin-${input.commandUuid}-${index}-b`,
              label: `${sideB.name} · lado B`,
              kind: "match-side",
              displayOrder: spotOrder + 1,
              currentTeamId: sideB.id,
              createdAt: now,
              updatedAt: now
            }
          ])
          .returning();
        const group = pairing.groupUuid
          ? groupByUuid.get(pairing.groupUuid)
          : null;
        const round = pairing.competitionRoundUuid
          ? roundByUuid.get(pairing.competitionRoundUuid)
          : null;

        await tx.insert(championshipMatches).values({
          championshipId: championship.id,
          stageId: stage.id,
          groupId: group?.id ?? null,
          label: `${sideA.name} × ${sideB.name} · Jogo ${pairing.meeting}`,
          displayOrder,
          sideASpotId: sideASpot!.id,
          sideBSpotId: sideBSpot!.id,
          sideATeamId: sideA.id,
          sideBTeamId: sideB.id,
          competitionRoundId: round?.id ?? null,
          roomProgramId: association?.roomProgramId ?? null,
          bracket: "none",
          createdAt: now,
          updatedAt: now
        });
        displayOrder += 1;
        spotOrder += 2;
      }

      await tx
        .update(championshipStages)
        .set({
          config: {
            ...stage.config,
            roundRobin: {
              sameGroupMeetings: input.sameGroupMeetings,
              crossGroupMeetings: input.crossGroupMeetings,
              pairOverrides: input.pairOverrides ?? [],
              assignCompetitionRounds: input.assignCompetitionRounds ?? false
            }
          },
          revision: stage.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipStages.id, stage.id));
      const response = await projectChampionshipFormat(tx, championship);

      return {
        response: () => response,
        targetType: "stage",
        targetUuid: stage.uuid,
        before: null,
        after: {
          generatedMatchCount: missing.length,
          desiredMatchCount: preview.desiredMatchCount,
          preservedMatchCount: preview.existingMatchCount
        }
      };
    }
  );
}

async function buildStandingsProjection(
  database: DatabaseExecutor,
  championship: Championship,
  stageUuid: string,
  groupUuid: string
): Promise<StandingsProjection> {
  const stage = await requireStandingsStage(
    database,
    championship.id,
    stageUuid
  );
  const group = await requireGroup(database, stage.id, groupUuid);
  const [
    groupSpotRows,
    ruleRows,
    resultRows,
    routeRows,
    allSpotRows,
    allMatchRows,
    matchRouteRows,
    teamRows,
    latestRuns
  ] = await Promise.all([
    database
      .select()
      .from(championshipSpots)
      .where(
        and(
          eq(championshipSpots.groupId, group.id),
          eq(championshipSpots.kind, "group-entry")
        )
      )
      .orderBy(asc(championshipSpots.displayOrder), asc(championshipSpots.id)),
    database
      .select()
      .from(championshipClassificationRules)
      .where(eq(championshipClassificationRules.stageId, stage.id))
      .orderBy(asc(championshipClassificationRules.position)),
    database
      .select({ result: championshipMatchResultRevisions })
      .from(championshipMatchResultRevisions)
      .innerJoin(
        championshipMatches,
        eq(
          championshipMatchResultRevisions.championshipMatchId,
          championshipMatches.id
        )
      )
      .where(
        and(
          eq(championshipMatches.stageId, stage.id),
          eq(championshipMatchResultRevisions.state, "current")
        )
      ),
    database
      .select()
      .from(championshipProgressionRoutes)
      .where(
        and(
          eq(championshipProgressionRoutes.championshipId, championship.id),
          eq(championshipProgressionRoutes.sourceKind, "classification-rank"),
          eq(championshipProgressionRoutes.sourceGroupId, group.id),
          eq(championshipProgressionRoutes.state, "active")
        )
      )
      .orderBy(
        asc(championshipProgressionRoutes.priority),
        asc(championshipProgressionRoutes.id)
      ),
    database
      .select()
      .from(championshipSpots)
      .where(eq(championshipSpots.championshipId, championship.id)),
    database
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championshipId, championship.id)),
    database
      .select()
      .from(championshipProgressionRoutes)
      .where(
        and(
          eq(championshipProgressionRoutes.championshipId, championship.id),
          eq(championshipProgressionRoutes.state, "active")
        )
      ),
    database
      .select()
      .from(championshipTeams)
      .where(eq(championshipTeams.championshipId, championship.id)),
    database
      .select()
      .from(championshipClassificationRuns)
      .where(
        and(
          eq(championshipClassificationRuns.stageId, stage.id),
          eq(championshipClassificationRuns.groupId, group.id)
        )
      )
      .orderBy(sql`${championshipClassificationRuns.id} desc`)
      .limit(1)
  ]);
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const standingsTeams = groupSpotRows.flatMap((spot) => {
    const team = spot.currentTeamId ? teamById.get(spot.currentTeamId) : null;

    return team
      ? [
          {
            id: team.id,
            uuid: team.uuid,
            name: team.name,
            displayOrder: spot.displayOrder
          }
        ]
      : [];
  });
  const scoring = standingsScoring(stage.config);
  const visibleMetrics = standingsVisibleMetrics(stage.config, scoring.mode);
  const rules: StandingsRule[] =
    ruleRows.length > 0
      ? ruleRows.map((rule) => ({
          criterion: rule.criterion,
          direction: rule.direction,
          config: rule.config
        }))
      : scoring.mode === "results"
        ? resultsDefaultRules
        : defaultRules;
  const headToHeadRestart = standingsRestart(stage.config);
  const standings = calculateStandings({
    teams: standingsTeams,
    matches: resultRows.flatMap(({ result }) =>
      result.sideATeamId && result.sideBTeamId
        ? [
            {
              uuid: result.uuid,
              sideATeamId: result.sideATeamId,
              sideBTeamId: result.sideBTeamId,
              sideAOfficialScore: result.sideAOfficialScore,
              sideBOfficialScore: result.sideBOfficialScore,
              sideAOutcome: result.sideAOutcome,
              sideBOutcome: result.sideBOutcome
            }
          ]
        : []
    ),
    rules,
    scoring,
    headToHeadRestart
  });
  const spotById = new Map(allSpotRows.map((spot) => [spot.id, spot]));
  const qualification = routeRows.map((route) => {
    const destination = spotById.get(route.destinationSpotId)!;
    const rank = route.sourceRank ?? 0;
    const unresolved = standings.unresolvedTies.find(
      (tie) => tie.rankFrom <= rank && tie.rankTo >= rank
    );
    const row = unresolved
      ? standings.rows.find(
          (candidate) => candidate.tieGroup === unresolved.key
        )
      : standings.rows.find((candidate) => candidate.rank === rank);
    const blocked = !row || row.unresolvedTie;
    const nextTeam = blocked ? null : teamById.get(row.team.id)!;
    const previousTeam = destination.currentTeamId
      ? (teamById.get(destination.currentTeamId) ?? null)
      : null;

    return {
      routeUuid: route.uuid,
      rank: route.sourceRank!,
      destinationSpotUuid: destination.uuid,
      destinationSpotLabel: destination.label,
      previousTeam: teamReference(previousTeam),
      nextTeam: teamReference(nextTeam),
      changed: !blocked && destination.currentTeamId !== nextTeam?.id,
      blocked,
      reason: !row
        ? "No team currently occupies this classification rank"
        : row.unresolvedTie
          ? `Rank ${route.sourceRank} is inside an unresolved tie`
          : null,
      destinationSpotId: destination.id,
      nextTeamId: nextTeam?.id ?? null
    };
  });
  const changedSpotIds = qualification
    .filter((route) => route.changed)
    .map((route) => route.destinationSpotId);
  const cascade = calculateCorrectionCascade(
    -1,
    changedSpotIds,
    allMatchRows,
    matchRouteRows.flatMap((route) =>
      route.sourceMatchId
        ? [
            {
              sourceMatchId: route.sourceMatchId,
              destinationSpotId: route.destinationSpotId
            }
          ]
        : []
    )
  );
  const response: ChampionshipStandingsResponse = {
    championshipUuid: championship.uuid,
    championshipRevision: championship.revision,
    stage: {
      uuid: stage.uuid,
      name: stage.name,
      revision: stage.revision
    },
    group: {
      uuid: group.uuid,
      stageUuid: stage.uuid,
      name: group.name,
      displayOrder: group.displayOrder,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    },
    scoring,
    visibleMetrics,
    headToHeadRestart,
    rules:
      ruleRows.length > 0
        ? ruleRows.map((rule) => ({
            uuid: rule.uuid,
            position: rule.position,
            criterion: rule.criterion,
            direction: rule.direction,
            config: rule.config
          }))
        : defaultRules.map((rule, position) => ({
            uuid: null,
            position,
            criterion: rule.criterion,
            direction: rule.direction,
            config: rule.config ?? null
          })),
    rows: standings.rows.map((row) => ({
      ...row,
      team: teamReference(teamById.get(row.team.id))!
    })),
    unresolvedTies: standings.unresolvedTies,
    qualification: qualification.map(
      ({
        destinationSpotId: _destinationSpotId,
        nextTeamId: _nextTeamId,
        ...route
      }) => route
    ),
    affectedMatches: cascade.map(({ match, depth }) => ({
      matchUuid: match.uuid,
      label: match.label,
      depth,
      hadResult: match.resultRevision > 0,
      hadEvidence: match.evidenceRevision > 0
    })),
    canApply: qualification.every((route) => !route.blocked),
    latestRun: latestRuns[0]
      ? {
          uuid: latestRuns[0].uuid,
          revision: latestRuns[0].revision,
          status: latestRuns[0].status,
          createdAt: latestRuns[0].createdAt
        }
      : null
  };

  return {
    response,
    placements: qualification.flatMap((route) =>
      !route.blocked && route.nextTeamId !== null
        ? [
            {
              routeUuid: route.routeUuid,
              destinationSpotId: route.destinationSpotId,
              nextTeamId: route.nextTeamId,
              changed: route.changed
            }
          ]
        : []
    )
  };
}

async function buildRoundRobinPreview(
  database: DatabaseExecutor,
  championship: Championship,
  stage: typeof championshipStages.$inferSelect,
  input:
    | PreviewChampionshipRoundRobinInput
    | GenerateChampionshipRoundRobinInput
): Promise<ChampionshipRoundRobinPreviewResponse> {
  const context = await loadRoundRobinContext(
    database,
    championship,
    stage,
    input
  );
  const teamById = new Map(context.teams.map((team) => [team.id, team]));
  const groupTeams = new Map<string, typeof context.teams>();

  for (const team of context.teams) {
    const current = groupTeams.get(team.groupUuid) ?? [];
    current.push(team);
    groupTeams.set(team.groupUuid, current);
  }

  return {
    stageUuid: stage.uuid,
    groups: context.groups.map((group) => ({
      uuid: group.uuid,
      name: group.name,
      teams: (groupTeams.get(group.uuid) ?? []).map(
        (team) => teamReference(team)!
      )
    })),
    pairings: {
      items: context.plan.pairings.slice(0, 500).map((pairing) => ({
        key: pairing.key,
        sideA: teamReference(teamById.get(pairing.sideATeamId))!,
        sideB: teamReference(teamById.get(pairing.sideBTeamId))!,
        groupUuid: pairing.groupUuid,
        meeting: pairing.meeting,
        existing: pairing.existing,
        competitionRoundUuid: pairing.competitionRoundUuid
      })),
      totalCount: context.plan.pairings.length,
      truncated: context.plan.pairings.length > 500
    },
    desiredMatchCount: context.plan.desiredMatchCount,
    existingMatchCount: context.plan.existingMatchCount,
    missingMatchCount: context.plan.missingMatchCount,
    excessMatchCount: context.plan.excessMatchCount,
    canGenerate: context.plan.desiredMatchCount <= 500,
    generationBlockedReason:
      context.plan.desiredMatchCount > 500
        ? "A geração é limitada a 500 partidas desejadas por etapa."
        : null,
    matchCountsByTeam: context.plan.matchCountsByTeam.map((row) => ({
      team: teamReference(teamById.get(row.teamId))!,
      desired: row.desired,
      existing: row.existing,
      missing: row.missing
    }))
  };
}

async function loadRoundRobinContext(
  database: DatabaseExecutor,
  championship: Championship,
  stage: typeof championshipStages.$inferSelect,
  input:
    | PreviewChampionshipRoundRobinInput
    | GenerateChampionshipRoundRobinInput
) {
  const [groups, spots, existingMatches, rounds] = await Promise.all([
    database
      .select()
      .from(championshipGroups)
      .where(eq(championshipGroups.stageId, stage.id))
      .orderBy(
        asc(championshipGroups.displayOrder),
        asc(championshipGroups.id)
      ),
    database
      .select()
      .from(championshipSpots)
      .where(
        and(
          eq(championshipSpots.stageId, stage.id),
          eq(championshipSpots.kind, "group-entry")
        )
      )
      .orderBy(asc(championshipSpots.displayOrder), asc(championshipSpots.id)),
    database
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.stageId, stage.id)),
    input.assignCompetitionRounds
      ? database
          .select()
          .from(championshipCompetitionRounds)
          .where(
            and(
              eq(championshipCompetitionRounds.championshipId, championship.id),
              eq(championshipCompetitionRounds.stageId, stage.id)
            )
          )
          .orderBy(
            asc(championshipCompetitionRounds.sequence),
            asc(championshipCompetitionRounds.id)
          )
      : Promise.resolve([])
  ]);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const teamIds = spots
    .map((spot) => spot.currentTeamId)
    .filter((id): id is number => id !== null);
  const uniqueTeamIds = new Set(teamIds);

  if (uniqueTeamIds.size !== teamIds.length) {
    throw conflict("A team cannot occupy more than one group entry spot");
  }
  const teamRows =
    uniqueTeamIds.size > 0
      ? await database
          .select()
          .from(championshipTeams)
          .where(
            and(
              eq(championshipTeams.championshipId, championship.id),
              inArray(championshipTeams.id, [...uniqueTeamIds])
            )
          )
      : [];
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const teams = spots.flatMap((spot) => {
    const team = spot.currentTeamId ? teamById.get(spot.currentTeamId) : null;
    const group = spot.groupId ? groupById.get(spot.groupId) : null;

    return team && group ? [{ ...team, groupUuid: group.uuid }] : [];
  });
  const overrides = resolvePairOverrides(groups, input.pairOverrides ?? []);
  const participantIds = new Set(teams.map((team) => team.id));
  const plan = generateRoundRobinPlan({
    teams,
    existingMatches: existingMatches.flatMap((match) =>
      match.sideATeamId &&
      match.sideBTeamId &&
      participantIds.has(match.sideATeamId) &&
      participantIds.has(match.sideBTeamId)
        ? [
            {
              sideATeamId: match.sideATeamId,
              sideBTeamId: match.sideBTeamId
            }
          ]
        : []
    ),
    sameGroupMeetings: input.sameGroupMeetings,
    crossGroupMeetings: input.crossGroupMeetings,
    pairOverrides: overrides,
    competitionRoundUuids: rounds.map((round) => round.uuid)
  });

  return { groups, teams, rounds, plan };
}

function resolvePairOverrides(
  groups: Array<typeof championshipGroups.$inferSelect>,
  overrides: Array<{
    groupAId: string;
    groupBId: string;
    meetings: number;
  }>
): RoundRobinPairOverride[] {
  const groupUuids = new Set(groups.map((group) => group.uuid));
  const seen = new Set<string>();

  return overrides.map((override) => {
    if (
      !groupUuids.has(override.groupAId) ||
      !groupUuids.has(override.groupBId)
    ) {
      throw badRequest(
        "Every round-robin override group must belong to the stage"
      );
    }
    const key = [override.groupAId, override.groupBId].sort().join(":");
    if (seen.has(key)) {
      throw badRequest("Round-robin group-pair overrides must be unique");
    }
    seen.add(key);

    return {
      groupAUuid: override.groupAId,
      groupBUuid: override.groupBId,
      meetings: override.meetings
    };
  });
}

async function requireChampionship(
  database: DatabaseExecutor,
  championshipUuid: string
) {
  const [championship] = await database
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) throw notFound("Championship not found");
  return championship;
}

async function requireStandingsStage(
  database: DatabaseExecutor,
  championshipId: number,
  stageUuid: string
) {
  const [stage] = await database
    .select()
    .from(championshipStages)
    .where(
      and(
        eq(championshipStages.championshipId, championshipId),
        eq(championshipStages.uuid, stageUuid)
      )
    );

  if (!stage) throw notFound("Championship stage not found");
  if (stage.engine !== "standings") {
    throw badRequest("This operation requires a standings stage");
  }
  return stage;
}

async function requireGroup(
  database: DatabaseExecutor,
  stageId: number,
  groupUuid: string
) {
  const [group] = await database
    .select()
    .from(championshipGroups)
    .where(
      and(
        eq(championshipGroups.stageId, stageId),
        eq(championshipGroups.uuid, groupUuid)
      )
    );

  if (!group) throw notFound("Championship group not found");
  return group;
}

async function resolveTeams(
  database: DatabaseExecutor,
  championshipId: number,
  teamUuids: string[]
) {
  if (teamUuids.length === 0) return [];
  const teams = await database
    .select()
    .from(championshipTeams)
    .where(
      and(
        eq(championshipTeams.championshipId, championshipId),
        inArray(championshipTeams.uuid, teamUuids)
      )
    );
  const byUuid = new Map(teams.map((team) => [team.uuid, team]));

  if (teams.length !== teamUuids.length) {
    throw badRequest("Every group team must belong to the championship");
  }

  return teamUuids.map((uuid) => byUuid.get(uuid)!);
}

async function assertTeamsAreNotAlreadyGrouped(
  database: DatabaseExecutor,
  stageId: number,
  teamIds: number[]
) {
  if (teamIds.length === 0) return;
  const occupied = await database
    .select()
    .from(championshipSpots)
    .where(
      and(
        eq(championshipSpots.stageId, stageId),
        eq(championshipSpots.kind, "group-entry"),
        inArray(championshipSpots.currentTeamId, teamIds)
      )
    );

  if (occupied.length > 0) {
    throw conflict("A team can occupy only one group in a standings stage");
  }
}

async function nextGroupDisplayOrder(
  database: DatabaseExecutor,
  stageId: number
) {
  const [row] = await database
    .select({ maximum: sql<number>`max(${championshipGroups.displayOrder})` })
    .from(championshipGroups)
    .where(eq(championshipGroups.stageId, stageId));

  return row?.maximum === null || row?.maximum === undefined
    ? 0
    : row.maximum + 1;
}

async function nextSpotDisplayOrder(
  database: DatabaseExecutor,
  stageId: number
) {
  const [row] = await database
    .select({ maximum: sql<number>`max(${championshipSpots.displayOrder})` })
    .from(championshipSpots)
    .where(eq(championshipSpots.stageId, stageId));

  return row?.maximum === null || row?.maximum === undefined
    ? 0
    : row.maximum + 1;
}

async function nextMatchDisplayOrder(
  database: DatabaseExecutor,
  stageId: number
) {
  const [row] = await database
    .select({ maximum: sql<number>`max(${championshipMatches.displayOrder})` })
    .from(championshipMatches)
    .where(eq(championshipMatches.stageId, stageId));

  return row?.maximum === null || row?.maximum === undefined
    ? 0
    : row.maximum + 1;
}

async function bumpStageRevision(
  database: DbTransaction,
  stageId: number,
  revision: number,
  now: string
) {
  await database
    .update(championshipStages)
    .set({ revision: revision + 1, updatedAt: now })
    .where(eq(championshipStages.id, stageId));
}

function standingsScoring(config: Record<string, unknown>): StandingsScoring {
  const scoring = config.standingsScoring;

  if (
    scoring &&
    typeof scoring === "object" &&
    "mode" in scoring &&
    scoring.mode === "results"
  ) {
    return resultsScoring;
  }

  if (
    scoring &&
    typeof scoring === "object" &&
    "win" in scoring &&
    "draw" in scoring &&
    "loss" in scoring &&
    typeof scoring.win === "number" &&
    typeof scoring.draw === "number" &&
    typeof scoring.loss === "number"
  ) {
    return {
      mode: "points",
      win: scoring.win,
      draw: scoring.draw,
      loss: scoring.loss
    };
  }

  return defaultScoring;
}

function standingsVisibleMetrics(
  config: Record<string, unknown>,
  mode: StandingsScoring["mode"]
): StandingsVisibleMetric[] {
  const configured = config.standingsVisibleMetrics;
  const metrics = Array.isArray(configured)
    ? configured.filter((value): value is StandingsVisibleMetric =>
        isStandingsVisibleMetric(value)
      )
    : [...defaultVisibleMetrics];
  const unique = [...new Set(metrics)];

  if (mode === "results") {
    const resultMetrics = unique.filter((metric) => metric !== "points");
    return resultMetrics.length > 0
      ? resultMetrics
      : defaultVisibleMetrics.filter((metric) => metric !== "points");
  }

  return unique.length > 0 ? unique : [...defaultVisibleMetrics];
}

function normalizeScoring(
  input: ConfigureChampionshipStandingsInput["scoring"]
): StandingsScoring {
  const scoring = input as {
    mode?: unknown;
    win?: unknown;
    draw?: unknown;
    loss?: unknown;
  };

  if (scoring.mode === "results") {
    return resultsScoring;
  }

  return {
    mode: "points",
    win: typeof scoring.win === "number" ? scoring.win : 3,
    draw: typeof scoring.draw === "number" ? scoring.draw : 1,
    loss: typeof scoring.loss === "number" ? scoring.loss : 0
  };
}

function normalizeVisibleMetrics(
  metrics: ConfigureChampionshipStandingsInput["visibleMetrics"] | undefined,
  mode: StandingsScoring["mode"]
): StandingsVisibleMetric[] {
  const normalized = Array.isArray(metrics)
    ? [
        ...new Set(
          metrics.filter((value): value is StandingsVisibleMetric =>
            isStandingsVisibleMetric(value)
          )
        )
      ]
    : standingsVisibleMetrics({}, mode);

  return normalized.length > 0
    ? normalized
    : mode === "results"
      ? defaultVisibleMetrics.filter((metric) => metric !== "points")
      : [...defaultVisibleMetrics];
}

function isStandingsVisibleMetric(
  value: unknown
): value is StandingsVisibleMetric {
  return (
    value === "played" ||
    value === "wins" ||
    value === "draws" ||
    value === "losses" ||
    value === "score-for" ||
    value === "score-against" ||
    value === "score-difference" ||
    value === "points"
  );
}

function validateVisibleMetrics(
  metrics: ConfigureChampionshipStandingsInput["visibleMetrics"] | undefined,
  mode: StandingsScoring["mode"]
) {
  if (mode === "results" && metrics?.includes("points")) {
    throw badRequest("Point visibility requires point scoring");
  }
}

function standingsRestart(
  config: Record<string, unknown>
): "continue" | "restart-for-subgroup" {
  return config.headToHeadRestart === "restart-for-subgroup"
    ? "restart-for-subgroup"
    : "continue";
}

function validateClassificationRules(
  rules: ConfigureChampionshipStandingsInput["rules"],
  mode: StandingsScoring["mode"]
) {
  if (
    mode === "results" &&
    rules.some((rule) => isPointCriterion(rule.criterion))
  ) {
    throw badRequest(
      "Point-based classification criteria require point scoring"
    );
  }
  const manualRules = rules.filter((rule) => rule.criterion === "manual");

  if (manualRules.length > 1) {
    throw badRequest("Only one manual classification criterion is allowed");
  }
  for (const rule of manualRules) {
    if (
      !Array.isArray(rule.config?.teamOrder) ||
      !rule.config.teamOrder.every((value) => typeof value === "string")
    ) {
      throw badRequest(
        "Manual classification requires an ordered teamOrder UUID list"
      );
    }
  }
}

function isPointCriterion(criterion: StandingsRule["criterion"]) {
  return (
    criterion === "points" ||
    criterion === "head-to-head" ||
    criterion === "head-to-head-points"
  );
}

function assertConfirmedImpact(confirmed: string[], actual: string[]) {
  const expected = [...actual].sort();
  const received = [...confirmed].sort();

  if (
    expected.length !== received.length ||
    expected.some((uuid, index) => uuid !== received[index])
  ) {
    throw conflict("Classification impact changed; preview it again", {
      expectedImpactMatchUuids: expected,
      confirmedImpactMatchUuids: received
    });
  }
}

function requireRevision(
  resource: string,
  currentRevision: number,
  expectedRevision: number
) {
  if (currentRevision !== expectedRevision) {
    throw conflict(`${resource} revision does not match`, {
      currentRevision,
      expectedRevision
    });
  }
}

function teamReference(
  team:
    | (typeof championshipTeams.$inferSelect & { groupUuid?: string })
    | undefined
    | null
) {
  return team
    ? {
        uuid: team.uuid,
        name: team.name,
        abbreviation: team.abbreviation,
        colors: team.colors
      }
    : null;
}
