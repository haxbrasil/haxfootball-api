import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import { db, type DatabaseExecutor, type DbTransaction } from "@/db/client";
import type {
  ChampionshipFormatQuery,
  DeleteChampionshipStageInput,
  CreateChampionshipCompetitionRoundInput,
  CreateChampionshipMatchInput,
  CreateChampionshipRouteInput,
  CreateChampionshipSpotInput,
  CreateChampionshipStageInput,
  GenerateDoubleEliminationInput,
  GenerateSingleEliminationInput,
  PlaceChampionshipSpotInput,
  PreviewChampionshipSpotPlacementInput,
  PreviewDoubleEliminationInput,
  ScheduleChampionshipMatchInput,
  UpdateChampionshipRouteInput,
  UpdateChampionshipStageInput
} from "@/features/championships/_shared/http/inputs";
import type {
  ChampionshipDoubleEliminationPreviewResponse,
  ChampionshipFormatResponse,
  ChampionshipSpotPlacementPreviewResponse
} from "@/features/championships/_shared/http/responses";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import type { ChampionshipActor } from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  championshipRoomPrograms,
  championships,
  type Championship
} from "@/features/championships/core/db";
import { championshipTeams } from "@/features/championships/people/db";
import {
  championshipClassificationRules,
  championshipClassificationRuns,
  championshipCompetitionRounds,
  championshipGroups,
  championshipLatePlayAuthorizations,
  championshipMatches,
  championshipProgressionRoutes,
  championshipScheduleProposals,
  championshipSpots,
  championshipStages
} from "@/features/championships/format-scheduling/db";
import {
  championshipMatchAppearances,
  championshipMatchAttributions,
  championshipMatchEvidence,
  championshipMatchEvidenceRounds,
  championshipMatchResultRevisions,
  championshipStatisticEntries
} from "@/features/championships/matches-statistics/db";
import {
  championshipScheduleStatusFor,
  validateChampionshipScheduledTime
} from "@/features/championships/format-scheduling/scheduling";
import {
  generateDoubleEliminationPlan,
  generateSingleEliminationPlan,
  type DoubleEliminationPlan
} from "@/features/championships/format-scheduling/bracket-engine";
import { calculateCorrectionCascade } from "@/features/championships/matches-statistics/cascade";
import {
  invalidateChampionshipDownstreamMatches,
  placeTeamIntoChampionshipSpot
} from "@/features/championships/format-scheduling/progression";
import { syncPlacementSpot } from "@/features/championships/history/placement-sync";
import { roomPrograms } from "@/features/rooms/core-db";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "@/shared/http/errors";

const defaultFormatLimit = 200;

export async function getChampionshipFormat(
  championshipUuid: string,
  query: ChampionshipFormatQuery = {}
): Promise<ChampionshipFormatResponse> {
  const [championship] = await db
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  if (championship.visibility !== "public") {
    if (!query.actorAccountUuid) {
      throw forbidden("Private championship format requires staff access");
    }
    await requireChampionshipActor(db, {
      actorAccountUuid: query.actorAccountUuid,
      championshipId: championship.id,
      permission: ["championship:admin", "championship:operate"]
    });
  }

  return projectChampionshipFormat(db, championship, query.limit);
}

export async function createChampionshipStage(
  championshipUuid: string,
  input: CreateChampionshipStageInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.stage.created",
    async (tx, championship) => {
      const defaultProgram = await resolveChampionshipProgram(
        tx,
        championship.id,
        input.defaultRoomProgramId
      );
      const displayOrder =
        input.displayOrder ??
        (await nextStageDisplayOrder(tx, championship.id));
      const [stage] = await tx
        .insert(championshipStages)
        .values({
          championshipId: championship.id,
          name: input.name,
          displayOrder,
          engine: input.engine,
          config: input.config ?? {},
          defaultChampionshipRoomProgramId: defaultProgram?.associationId
        })
        .returning();

      return {
        targetType: "stage",
        targetUuid: stage.uuid,
        before: null,
        after: {
          name: stage.name,
          engine: stage.engine,
          displayOrder: stage.displayOrder
        }
      };
    }
  );
}

export async function updateChampionshipStage(
  championshipUuid: string,
  stageUuid: string,
  input: UpdateChampionshipStageInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.stage.updated",
    async (tx, championship) => {
      const stage = await requireStage(tx, championship.id, stageUuid);
      requireRevision("stage", stage.revision, input.expectedStageRevision);
      const defaultProgram =
        input.defaultRoomProgramId === undefined
          ? undefined
          : await resolveChampionshipProgram(
              tx,
              championship.id,
              input.defaultRoomProgramId
            );
      const [updated] = await tx
        .update(championshipStages)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.state === undefined ? {} : { state: input.state }),
          ...(input.config === undefined ? {} : { config: input.config }),
          ...(defaultProgram === undefined
            ? {}
            : {
                defaultChampionshipRoomProgramId:
                  defaultProgram?.associationId ?? null
              }),
          revision: stage.revision + 1,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championshipStages.id, stage.id))
        .returning();

      return {
        targetType: "stage",
        targetUuid: stage.uuid,
        before: stage,
        after: updated
      };
    }
  );
}

export async function deleteChampionshipStage(
  championshipUuid: string,
  stageUuid: string,
  input: DeleteChampionshipStageInput
): Promise<ChampionshipFormatResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "format.stage.deleted"
    },
    async (tx, championship) => {
      const stage = await requireStage(tx, championship.id, stageUuid);
      await deleteStageContents(tx, stage.id);
      await tx
        .delete(championshipStages)
        .where(eq(championshipStages.id, stage.id));
      const response = await projectChampionshipFormat(tx, championship);

      return {
        response: () => response,
        targetType: "stage",
        targetUuid: stage.uuid,
        before: stage,
        after: null
      };
    }
  );
}

/** Deletes a stage's owned graph. Physical room games are intentionally never deleted. */
async function deleteStageContents(tx: DbTransaction, stageId: number) {
  const [matches, groups, spots] = await Promise.all([
    tx
      .select({ id: championshipMatches.id })
      .from(championshipMatches)
      .where(eq(championshipMatches.stageId, stageId)),
    tx
      .select({ id: championshipGroups.id })
      .from(championshipGroups)
      .where(eq(championshipGroups.stageId, stageId)),
    tx
      .select({ id: championshipSpots.id })
      .from(championshipSpots)
      .where(eq(championshipSpots.stageId, stageId))
  ]);
  const matchIds = matches.map((match) => match.id);
  const groupIds = groups.map((group) => group.id);
  const spotIds = spots.map((spot) => spot.id);

  if (matchIds.length) {
    const [evidence, resultRevisions] = await Promise.all([
      tx
        .select({ id: championshipMatchEvidence.id })
        .from(championshipMatchEvidence)
        .where(
          inArray(championshipMatchEvidence.championshipMatchId, matchIds)
        ),
      tx
        .select({ id: championshipMatchResultRevisions.id })
        .from(championshipMatchResultRevisions)
        .where(
          inArray(
            championshipMatchResultRevisions.championshipMatchId,
            matchIds
          )
        )
    ]);
    const evidenceIds = evidence.map((item) => item.id);
    const resultRevisionIds = resultRevisions.map((item) => item.id);

    if (resultRevisionIds.length) {
      await Promise.all([
        tx
          .delete(championshipStatisticEntries)
          .where(
            inArray(
              championshipStatisticEntries.resultRevisionId,
              resultRevisionIds
            )
          ),
        tx
          .delete(championshipMatchAppearances)
          .where(
            inArray(
              championshipMatchAppearances.resultRevisionId,
              resultRevisionIds
            )
          ),
        tx
          .delete(championshipMatchAttributions)
          .where(
            inArray(
              championshipMatchAttributions.resultRevisionId,
              resultRevisionIds
            )
          )
      ]);
      await tx
        .delete(championshipMatchResultRevisions)
        .where(inArray(championshipMatchResultRevisions.id, resultRevisionIds));
    }
    if (evidenceIds.length) {
      await tx
        .delete(championshipMatchEvidenceRounds)
        .where(
          inArray(championshipMatchEvidenceRounds.evidenceId, evidenceIds)
        );
      await tx
        .delete(championshipMatchEvidence)
        .where(inArray(championshipMatchEvidence.id, evidenceIds));
    }
    await Promise.all([
      tx
        .delete(championshipScheduleProposals)
        .where(
          inArray(championshipScheduleProposals.championshipMatchId, matchIds)
        ),
      tx
        .delete(championshipLatePlayAuthorizations)
        .where(
          inArray(
            championshipLatePlayAuthorizations.championshipMatchId,
            matchIds
          )
        )
    ]);
  }

  const routePredicates = [
    matchIds.length
      ? inArray(championshipProgressionRoutes.sourceMatchId, matchIds)
      : undefined,
    groupIds.length
      ? inArray(championshipProgressionRoutes.sourceGroupId, groupIds)
      : undefined,
    spotIds.length
      ? inArray(championshipProgressionRoutes.destinationSpotId, spotIds)
      : undefined
  ].filter(Boolean);
  if (routePredicates.length) {
    await tx
      .delete(championshipProgressionRoutes)
      .where(or(...routePredicates));
  }

  await tx
    .delete(championshipClassificationRuns)
    .where(eq(championshipClassificationRuns.stageId, stageId));
  await tx
    .delete(championshipClassificationRules)
    .where(eq(championshipClassificationRules.stageId, stageId));
  if (matchIds.length) {
    await tx
      .delete(championshipMatches)
      .where(inArray(championshipMatches.id, matchIds));
  }
  await tx
    .delete(championshipCompetitionRounds)
    .where(eq(championshipCompetitionRounds.stageId, stageId));
  if (spotIds.length) {
    await tx
      .delete(championshipSpots)
      .where(inArray(championshipSpots.id, spotIds));
  }
  if (groupIds.length) {
    await tx
      .delete(championshipGroups)
      .where(inArray(championshipGroups.id, groupIds));
  }
}

export async function generateSingleElimination(
  championshipUuid: string,
  input: GenerateSingleEliminationInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.single-elimination.generated",
    async (tx, championship) => {
      const teams = await resolveTeams(tx, championship.id, input.teamIds);
      const plan = generateSingleEliminationPlan(teams.length);
      const program = await resolveChampionshipProgram(
        tx,
        championship.id,
        input.defaultRoomProgramId
      );
      const stageDisplayOrder = await nextStageDisplayOrder(
        tx,
        championship.id
      );
      const [stage] = await tx
        .insert(championshipStages)
        .values({
          championshipId: championship.id,
          name: input.name,
          displayOrder: stageDisplayOrder,
          engine: "single-elimination",
          config: {
            bracketSize: plan.bracketSize,
            teamCount: teams.length,
            seeding: "standard",
            competitionRoundMode:
              input.competitionRoundMode ?? "per-bracket-round"
          },
          defaultChampionshipRoomProgramId: program?.associationId
        })
        .returning();
      const roundByNumber = new Map<number, number>();

      if (input.createCompetitionRounds ?? true) {
        const firstSequence = await nextCompetitionRoundSequence(
          tx,
          championship.id
        );
        const start = input.firstRoundStartsAt
          ? new Date(input.firstRoundStartsAt)
          : null;
        const durationMs = (input.roundDurationHours ?? 168) * 60 * 60 * 1_000;

        const generatedRoundCount =
          input.competitionRoundMode === "single-period" ? 1 : plan.roundCount;
        for (let round = 1; round <= generatedRoundCount; round += 1) {
          const startsAt = start
            ? new Date(start.getTime() + (round - 1) * durationMs)
            : null;
          const [competitionRound] = await tx
            .insert(championshipCompetitionRounds)
            .values({
              championshipId: championship.id,
              stageId: stage.id,
              name:
                input.competitionRoundMode === "single-period"
                  ? input.name
                  : roundName(round, plan.roundCount),
              sequence: firstSequence + round - 1,
              startsAt: startsAt?.toISOString() ?? null,
              endsAt: startsAt
                ? new Date(startsAt.getTime() + durationMs).toISOString()
                : null,
              schedulingAuthority: championship.rules.scheduling.authority,
              latePlayPolicy: championship.rules.scheduling.latePlayPolicy
            })
            .returning();

          roundByNumber.set(round, competitionRound.id);
        }
        if (input.competitionRoundMode === "single-period") {
          const periodId = roundByNumber.get(1)!;
          for (let round = 2; round <= plan.roundCount; round += 1) {
            roundByNumber.set(round, periodId);
          }
        }
      }

      const spotByKey = new Map<
        string,
        { id: number; uuid: string; teamId: number | null }
      >();

      for (const spotPlan of plan.spots) {
        const team =
          spotPlan.teamIndex === null ? null : teams[spotPlan.teamIndex]!;
        const [spot] = await tx
          .insert(championshipSpots)
          .values({
            championshipId: championship.id,
            stageId: stage.id,
            key: spotPlan.key,
            label: spotPlan.label,
            kind: spotPlan.kind,
            displayOrder: spotPlan.displayOrder,
            placementRank: spotPlan.placementRank ?? null,
            currentTeamId: team?.id ?? null,
            x: spotPlan.x,
            y: spotPlan.y
          })
          .returning();

        spotByKey.set(spotPlan.key, {
          id: spot.id,
          uuid: spot.uuid,
          teamId: team?.id ?? null
        });
      }

      const matchByKey = new Map<string, { id: number; uuid: string }>();

      for (const matchPlan of plan.matches) {
        const sideA = spotByKey.get(matchPlan.sideASpotKey)!;
        const sideB = spotByKey.get(matchPlan.sideBSpotKey)!;
        const byeTeam =
          matchPlan.byeTeamIndex === null
            ? null
            : teams[matchPlan.byeTeamIndex]!;
        const [match] = await tx
          .insert(championshipMatches)
          .values({
            championshipId: championship.id,
            stageId: stage.id,
            label: matchPlan.label,
            displayOrder: matchPlan.displayOrder,
            sideASpotId: sideA.id,
            sideBSpotId: sideB.id,
            sideATeamId: sideA.teamId,
            sideBTeamId: sideB.teamId,
            competitionRoundId: roundByNumber.get(matchPlan.round),
            roomProgramId: program?.roomProgramId,
            matchRulesOverride: byeTeam
              ? {
                  bye: true,
                  autoAdvancedTeamUuid: byeTeam.uuid
                }
              : null,
            scheduleStatus: byeTeam ? "played" : "unscheduled",
            bracket: "winners",
            bracketRound: matchPlan.round,
            bracketPosition: matchPlan.position
          })
          .returning();

        matchByKey.set(matchPlan.key, { id: match.id, uuid: match.uuid });
      }

      for (const routePlan of plan.routes) {
        const sourceMatch = matchByKey.get(routePlan.sourceMatchKey)!;
        const destinationSpot = spotByKey.get(routePlan.destinationSpotKey)!;

        await tx.insert(championshipProgressionRoutes).values({
          championshipId: championship.id,
          sourceKind: "match-outcome",
          sourceMatchId: sourceMatch.id,
          sourceOutcome: routePlan.sourceOutcome,
          destinationSpotId: destinationSpot.id
        });
      }

      return {
        targetType: "stage",
        targetUuid: stage.uuid,
        before: null,
        after: {
          engine: stage.engine,
          teamCount: teams.length,
          bracketSize: plan.bracketSize,
          matchCount: plan.matches.length,
          byeCount: plan.matches.filter((match) => match.byeTeamIndex !== null)
            .length,
          routeCount: plan.routes.length
        },
        outboxTopic: "championship.format.generated"
      };
    }
  );
}

export async function previewDoubleElimination(
  championshipUuid: string,
  input: PreviewDoubleEliminationInput
): Promise<ChampionshipDoubleEliminationPreviewResponse> {
  const [championship] = await db
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  await requireChampionshipActor(db, {
    actorAccountUuid: input.actorAccountUuid,
    championshipId: championship.id,
    permission: ["championship:admin", "championship:operate"]
  });
  const teams = await resolveTeams(db, championship.id, input.teamIds);
  const plan = generateDoubleEliminationPlan(
    teams.length,
    input.grandFinalReset
  );

  return {
    teamCount: teams.length,
    bracketSize: plan.bracketSize,
    winnersRoundCount: plan.winnersRoundCount,
    losersRoundCount: plan.losersRoundCount,
    grandFinalReset: plan.grandFinalReset,
    spots: plan.spots.map((spot) => {
      const team =
        spot.teamIndex === null ? null : (teams[spot.teamIndex] ?? null);

      return {
        key: spot.key,
        label: spot.label,
        kind: spot.kind,
        displayOrder: spot.displayOrder,
        placementRank: spot.placementRank ?? null,
        team: team
          ? {
              uuid: team.uuid,
              name: team.name,
              abbreviation: team.abbreviation,
              colors: team.colors
            }
          : null,
        x: spot.x,
        y: spot.y
      };
    }),
    matches: plan.matches,
    routes: plan.routes
  };
}

export async function generateDoubleElimination(
  championshipUuid: string,
  input: GenerateDoubleEliminationInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.double-elimination.generated",
    async (tx, championship) => {
      const teams = await resolveTeams(tx, championship.id, input.teamIds);
      const plan = generateDoubleEliminationPlan(
        teams.length,
        input.grandFinalReset
      );
      const program = await resolveChampionshipProgram(
        tx,
        championship.id,
        input.defaultRoomProgramId
      );
      const [stage] = await tx
        .insert(championshipStages)
        .values({
          championshipId: championship.id,
          name: input.name,
          displayOrder: await nextStageDisplayOrder(tx, championship.id),
          engine: "double-elimination",
          config: {
            bracketSize: plan.bracketSize,
            teamCount: teams.length,
            seeding: "standard",
            grandFinalReset: plan.grandFinalReset,
            winnersRoundCount: plan.winnersRoundCount,
            losersRoundCount: plan.losersRoundCount,
            competitionRoundMode:
              input.competitionRoundMode ?? "per-bracket-round"
          },
          defaultChampionshipRoomProgramId: program?.associationId
        })
        .returning();
      const competitionRoundByMatchKey = await createGeneratedCompetitionRounds(
        tx,
        championship,
        stage.id,
        plan,
        input
      );
      const spotByKey = new Map<
        string,
        { id: number; uuid: string; teamId: number | null }
      >();

      for (const spotPlan of plan.spots) {
        const team =
          spotPlan.teamIndex === null ? null : teams[spotPlan.teamIndex]!;
        const [spot] = await tx
          .insert(championshipSpots)
          .values({
            championshipId: championship.id,
            stageId: stage.id,
            key: spotPlan.key,
            label: spotPlan.label,
            kind: spotPlan.kind,
            displayOrder: spotPlan.displayOrder,
            placementRank: spotPlan.placementRank ?? null,
            currentTeamId: team?.id ?? null,
            x: spotPlan.x,
            y: spotPlan.y
          })
          .returning();

        spotByKey.set(spotPlan.key, {
          id: spot.id,
          uuid: spot.uuid,
          teamId: team?.id ?? null
        });
      }

      const matchByKey = new Map<string, { id: number; uuid: string }>();

      for (const matchPlan of plan.matches) {
        const sideA = spotByKey.get(matchPlan.sideASpotKey)!;
        const sideB = spotByKey.get(matchPlan.sideBSpotKey)!;
        const [match] = await tx
          .insert(championshipMatches)
          .values({
            championshipId: championship.id,
            stageId: stage.id,
            label: matchPlan.label,
            displayOrder: matchPlan.displayOrder,
            sideASpotId: sideA.id,
            sideBSpotId: sideB.id,
            sideATeamId: sideA.teamId,
            sideBTeamId: sideB.teamId,
            competitionRoundId: competitionRoundByMatchKey.get(matchPlan.key),
            roomProgramId: program?.roomProgramId,
            matchRulesOverride: matchPlan.autoBye
              ? { bye: true, automaticBye: true }
              : matchPlan.activation
                ? {
                    conditional: true,
                    activationSourceMatchKey:
                      matchPlan.activation.sourceMatchKey,
                    activationCondition: matchPlan.activation.condition
                  }
                : null,
            scheduleStatus: matchPlan.autoBye ? "played" : "unscheduled",
            bracket: matchPlan.bracket,
            bracketRound: matchPlan.round,
            bracketPosition: matchPlan.position
          })
          .returning();

        matchByKey.set(matchPlan.key, { id: match.id, uuid: match.uuid });
      }

      for (const routePlan of plan.routes) {
        await tx.insert(championshipProgressionRoutes).values({
          championshipId: championship.id,
          sourceKind: "match-outcome",
          sourceMatchId: matchByKey.get(routePlan.sourceMatchKey)!.id,
          sourceOutcome: routePlan.sourceOutcome,
          condition: routePlan.condition,
          destinationSpotId: spotByKey.get(routePlan.destinationSpotKey)!.id
        });
      }

      return {
        targetType: "stage",
        targetUuid: stage.uuid,
        before: null,
        after: {
          engine: stage.engine,
          teamCount: teams.length,
          bracketSize: plan.bracketSize,
          grandFinalReset: plan.grandFinalReset,
          matchCount: plan.matches.length,
          byeCount: plan.matches.filter((match) => match.autoBye).length,
          routeCount: plan.routes.length
        },
        outboxTopic: "championship.format.generated"
      };
    }
  );
}

export async function createChampionshipSpot(
  championshipUuid: string,
  input: CreateChampionshipSpotInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.spot.created",
    async (tx, championship) => {
      if (input.kind === "placement" && !input.placementRank) {
        throw badRequest("Placement spots require a placement rank");
      }
      if (input.kind !== "placement" && input.placementRank != null) {
        throw badRequest("Only placement spots may define a placement rank");
      }
      const stage = await requireStage(tx, championship.id, input.stageId);
      const group = input.groupId
        ? await requireGroup(tx, stage.id, input.groupId)
        : null;
      const team = input.teamId
        ? await requireTeam(tx, championship.id, input.teamId)
        : null;
      const displayOrder =
        input.displayOrder ?? (await nextSpotDisplayOrder(tx, stage.id));
      const [spot] = await tx
        .insert(championshipSpots)
        .values({
          championshipId: championship.id,
          stageId: stage.id,
          groupId: group?.id ?? null,
          key: input.key,
          label: input.label,
          kind: input.kind,
          displayOrder,
          placementRank: input.placementRank ?? null,
          currentTeamId: team?.id ?? null,
          x: input.x,
          y: input.y
        })
        .returning();
      await syncPlacementSpot(tx, spot, team?.id ?? null, "staff");

      return {
        targetType: "spot",
        targetUuid: spot.uuid,
        before: null,
        after: spot
      };
    }
  );
}

export async function placeChampionshipSpot(
  championshipUuid: string,
  spotUuid: string,
  input: PlaceChampionshipSpotInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.spot.placed",
    async (tx, championship) => {
      const spot = await requireSpot(tx, championship.id, spotUuid);
      requireRevision("spot", spot.revision, input.expectedSpotRevision);
      const impact = await calculateSpotPlacementImpact(
        tx,
        championship,
        spot,
        input
      );
      if (impact.sourceSpot) {
        if (input.expectedSourceSpotRevision === null) {
          throw badRequest(
            "A source spot revision is required when moving a team"
          );
        }
        if (input.expectedSourceSpotRevision === undefined) {
          throw badRequest(
            "A source spot revision is required when moving a team"
          );
        }
        requireRevision(
          "source spot",
          impact.sourceSpot.revision,
          input.expectedSourceSpotRevision
        );
      }
      assertConfirmedSpotImpact(
        input.confirmedImpactMatchUuids,
        impact.affectedMatchUuids
      );
      const now = new Date().toISOString();
      await invalidateChampionshipDownstreamMatches(
        tx,
        championship.id,
        impact.affectedMatchUuids,
        now
      );
      if (impact.sourceSpot) {
        await placeTeamIntoChampionshipSpot(
          tx,
          impact.sourceSpot.id,
          null,
          now
        );
      }
      await placeTeamIntoChampionshipSpot(
        tx,
        impact.targetSpot.id,
        impact.team?.id ?? null,
        now
      );

      return {
        targetType: "spot",
        targetUuid: spot.uuid,
        before: {
          targetTeamId: spot.currentTeamId,
          sourceSpotUuid: impact.sourceSpot?.uuid ?? null,
          sourceTeamId: impact.sourceSpot?.currentTeamId ?? null
        },
        after: {
          teamUuid: impact.team?.uuid ?? null,
          affectedMatchUuids: impact.affectedMatchUuids
        },
        reason: input.reason
      };
    }
  );
}

export async function previewChampionshipSpotPlacement(
  championshipUuid: string,
  spotUuid: string,
  input: PreviewChampionshipSpotPlacementInput
): Promise<ChampionshipSpotPlacementPreviewResponse> {
  const [championship] = await db
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) throw notFound("Championship not found");
  await requireChampionshipActor(db, {
    actorAccountUuid: input.actorAccountUuid,
    championshipId: championship.id,
    permission: ["championship:admin", "championship:operate"]
  });
  const targetSpot = await requireSpot(db, championship.id, spotUuid);
  const impact = await calculateSpotPlacementImpact(
    db,
    championship,
    targetSpot,
    input
  );

  return impact.response;
}

export async function createChampionshipRoute(
  championshipUuid: string,
  input: CreateChampionshipRouteInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.route.created",
    async (tx, championship) => {
      validateRouteSource(input);
      const destination = await requireSpot(
        tx,
        championship.id,
        input.destinationSpotId
      );
      const sourceMatch = input.sourceMatchId
        ? await requireFormatMatch(tx, championship.id, input.sourceMatchId)
        : null;
      const sourceGroup = input.sourceGroupId
        ? await requireChampionshipGroup(
            tx,
            championship.id,
            input.sourceGroupId
          )
        : null;
      const [route] = await tx
        .insert(championshipProgressionRoutes)
        .values({
          championshipId: championship.id,
          sourceKind: input.sourceKind,
          sourceMatchId: sourceMatch?.id ?? null,
          sourceGroupId: sourceGroup?.id ?? null,
          sourceOutcome: input.sourceOutcome,
          sourceRank: input.sourceRank,
          condition: input.condition ?? "always",
          destinationSpotId: destination.id,
          priority: input.priority ?? 0
        })
        .returning();

      return {
        targetType: "route",
        targetUuid: route.uuid,
        before: null,
        after: route
      };
    }
  );
}

export async function updateChampionshipRoute(
  championshipUuid: string,
  routeUuid: string,
  input: UpdateChampionshipRouteInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.route.updated",
    async (tx, championship) => {
      const [route] = await tx
        .select()
        .from(championshipProgressionRoutes)
        .where(
          and(
            eq(championshipProgressionRoutes.championshipId, championship.id),
            eq(championshipProgressionRoutes.uuid, routeUuid)
          )
        );

      if (!route) {
        throw notFound("Progression route not found");
      }
      const [updated] = await tx
        .update(championshipProgressionRoutes)
        .set({ state: input.state, updatedAt: new Date().toISOString() })
        .where(eq(championshipProgressionRoutes.id, route.id))
        .returning();

      return {
        targetType: "route",
        targetUuid: route.uuid,
        before: { state: route.state },
        after: { state: updated.state }
      };
    }
  );
}

export async function createChampionshipCompetitionRound(
  championshipUuid: string,
  input: CreateChampionshipCompetitionRoundInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.competition-round.created",
    async (tx, championship) => {
      validateDateRange(input.startsAt, input.endsAt);
      const stage = input.stageId
        ? await requireStage(tx, championship.id, input.stageId)
        : null;
      const [competitionRound] = await tx
        .insert(championshipCompetitionRounds)
        .values({
          championshipId: championship.id,
          stageId: stage?.id ?? null,
          name: input.name,
          sequence: input.sequence,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          schedulingAuthority:
            input.schedulingAuthority ??
            championship.rules.scheduling.authority,
          latePlayPolicy:
            input.latePlayPolicy ?? championship.rules.scheduling.latePlayPolicy
        })
        .returning();

      return {
        targetType: "competition-round",
        targetUuid: competitionRound.uuid,
        before: null,
        after: competitionRound
      };
    }
  );
}

export async function createChampionshipMatch(
  championshipUuid: string,
  input: CreateChampionshipMatchInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.match.created",
    async (tx, championship) => {
      const stage = await requireStage(tx, championship.id, input.stageId);
      const sideA = await requireSpot(tx, championship.id, input.sideASpotId);
      const sideB = await requireSpot(tx, championship.id, input.sideBSpotId);

      if (sideA.stageId !== stage.id || sideB.stageId !== stage.id) {
        throw badRequest("Match spots must belong to the selected stage");
      }
      if (sideA.id === sideB.id) {
        throw badRequest("A match requires two distinct spots");
      }

      const group = input.groupId
        ? await requireGroup(tx, stage.id, input.groupId)
        : null;
      const competitionRound = input.competitionRoundId
        ? await requireCompetitionRound(
            tx,
            championship.id,
            input.competitionRoundId
          )
        : null;
      const program = await resolveMatchProgram(
        tx,
        championship.id,
        stage.defaultChampionshipRoomProgramId,
        input.roomProgramId
      );
      const displayOrder =
        input.displayOrder ?? (await nextMatchDisplayOrder(tx, stage.id));
      const [match] = await tx
        .insert(championshipMatches)
        .values({
          championshipId: championship.id,
          stageId: stage.id,
          groupId: group?.id ?? null,
          label: input.label,
          displayOrder,
          sideASpotId: sideA.id,
          sideBSpotId: sideB.id,
          sideATeamId: sideA.currentTeamId,
          sideBTeamId: sideB.currentTeamId,
          competitionRoundId: competitionRound?.id ?? null,
          scheduledAt: input.scheduledAt,
          scheduleStatus: input.scheduledAt ? "scheduled" : "unscheduled",
          roomProgramId: program?.roomProgramId ?? null,
          matchRulesOverride: input.matchRulesOverride,
          bracket: "none"
        })
        .returning();

      return {
        targetType: "championship-match",
        targetUuid: match.uuid,
        before: null,
        after: match
      };
    }
  );
}

export async function scheduleChampionshipMatch(
  championshipUuid: string,
  matchUuid: string,
  input: ScheduleChampionshipMatchInput
): Promise<ChampionshipFormatResponse> {
  return formatCommand(
    championshipUuid,
    input,
    "format.match.scheduled",
    async (tx, championship, actor) => {
      const match = await requireFormatMatch(tx, championship.id, matchUuid);
      requireRevision("match", match.revision, input.expectedMatchRevision);
      const stage = await requireStageById(tx, match.stageId);
      const competitionRound = input.competitionRoundId
        ? await requireCompetitionRound(
            tx,
            championship.id,
            input.competitionRoundId
          )
        : null;
      if (input.scheduledAt) {
        await validateChampionshipScheduledTime(
          tx,
          { championship, match, round: competitionRound },
          input.scheduledAt
        );
      }
      const program =
        input.roomProgramId === undefined
          ? undefined
          : await resolveMatchProgram(
              tx,
              championship.id,
              stage.defaultChampionshipRoomProgramId,
              input.roomProgramId
            );
      const [updated] = await tx
        .update(championshipMatches)
        .set({
          competitionRoundId: competitionRound?.id ?? null,
          scheduledAt: input.scheduledAt,
          scheduleStatus:
            input.scheduleStatus === "canceled"
              ? "canceled"
              : input.scheduledAt
                ? championshipScheduleStatusFor(
                    { round: competitionRound },
                    input.scheduledAt
                  )
                : "unscheduled",
          ...(program === undefined
            ? {}
            : { roomProgramId: program?.roomProgramId ?? null }),
          scheduleRevision: match.scheduleRevision + 1,
          revision: match.revision + 1,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championshipMatches.id, match.id))
        .returning();
      const now = new Date().toISOString();
      await tx
        .update(championshipScheduleProposals)
        .set({
          state: "staff-decided",
          decidedByAccountId: actor.account.id,
          decidedAt: now,
          revision: sql`${championshipScheduleProposals.revision} + 1`,
          updatedAt: now
        })
        .where(
          and(
            eq(championshipScheduleProposals.championshipMatchId, match.id),
            eq(championshipScheduleProposals.state, "pending")
          )
        );

      return {
        targetType: "championship-match",
        targetUuid: match.uuid,
        before: match,
        after: updated
      };
    }
  );
}

type FormatCommandAudit = {
  targetType: string;
  targetUuid?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  outboxTopic?: string;
};

function formatCommand(
  championshipUuid: string,
  input: {
    actorAccountUuid: string;
    commandUuid: string;
    expectedRevision: number;
  },
  action: string,
  mutate: (
    tx: DbTransaction,
    championship: Championship,
    actor: ChampionshipActor
  ) => Promise<FormatCommandAudit>
): Promise<ChampionshipFormatResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action
    },
    async (tx, championship, actor) => {
      const audit = await mutate(tx, championship, actor);
      const response = await projectChampionshipFormat(
        tx,
        championship,
        defaultFormatLimit
      );

      return {
        response: () => response,
        ...audit
      };
    }
  );
}

export async function projectChampionshipFormat(
  database: DatabaseExecutor,
  championship: Championship,
  requestedLimit = defaultFormatLimit
): Promise<ChampionshipFormatResponse> {
  const limit = Math.min(500, Math.max(1, requestedLimit));
  const [stageRows, groupRows, spotRows, routeRows, roundRows, matchRows] =
    await Promise.all([
      database
        .select()
        .from(championshipStages)
        .where(eq(championshipStages.championshipId, championship.id))
        .orderBy(
          asc(championshipStages.displayOrder),
          asc(championshipStages.id)
        )
        .limit(limit + 1),
      database
        .select({ group: championshipGroups })
        .from(championshipGroups)
        .innerJoin(
          championshipStages,
          eq(championshipGroups.stageId, championshipStages.id)
        )
        .where(eq(championshipStages.championshipId, championship.id))
        .orderBy(
          asc(championshipStages.displayOrder),
          asc(championshipGroups.displayOrder),
          asc(championshipGroups.id)
        )
        .limit(limit + 1),
      database
        .select()
        .from(championshipSpots)
        .where(eq(championshipSpots.championshipId, championship.id))
        .orderBy(
          asc(championshipSpots.stageId),
          asc(championshipSpots.displayOrder),
          asc(championshipSpots.id)
        )
        .limit(limit + 1),
      database
        .select()
        .from(championshipProgressionRoutes)
        .where(
          eq(championshipProgressionRoutes.championshipId, championship.id)
        )
        .orderBy(
          asc(championshipProgressionRoutes.priority),
          asc(championshipProgressionRoutes.id)
        )
        .limit(limit + 1),
      database
        .select()
        .from(championshipCompetitionRounds)
        .where(
          eq(championshipCompetitionRounds.championshipId, championship.id)
        )
        .orderBy(
          asc(championshipCompetitionRounds.sequence),
          asc(championshipCompetitionRounds.id)
        )
        .limit(limit + 1),
      database
        .select()
        .from(championshipMatches)
        .where(eq(championshipMatches.championshipId, championship.id))
        .orderBy(
          asc(championshipMatches.stageId),
          asc(championshipMatches.displayOrder),
          asc(championshipMatches.id)
        )
        .limit(limit + 1)
    ]);
  const [
    stageCountRows,
    groupCountRows,
    spotCountRows,
    routeCountRows,
    roundCountRows,
    matchCountRows
  ] = await Promise.all([
    database
      .select({ value: count() })
      .from(championshipStages)
      .where(eq(championshipStages.championshipId, championship.id)),
    database
      .select({ value: count() })
      .from(championshipGroups)
      .innerJoin(
        championshipStages,
        eq(championshipGroups.stageId, championshipStages.id)
      )
      .where(eq(championshipStages.championshipId, championship.id)),
    database
      .select({ value: count() })
      .from(championshipSpots)
      .where(eq(championshipSpots.championshipId, championship.id)),
    database
      .select({ value: count() })
      .from(championshipProgressionRoutes)
      .where(eq(championshipProgressionRoutes.championshipId, championship.id)),
    database
      .select({ value: count() })
      .from(championshipCompetitionRounds)
      .where(eq(championshipCompetitionRounds.championshipId, championship.id)),
    database
      .select({ value: count() })
      .from(championshipMatches)
      .where(eq(championshipMatches.championshipId, championship.id))
  ]);
  const totals = {
    stages: stageCountRows[0]?.value ?? 0,
    groups: groupCountRows[0]?.value ?? 0,
    spots: spotCountRows[0]?.value ?? 0,
    routes: routeCountRows[0]?.value ?? 0,
    rounds: roundCountRows[0]?.value ?? 0,
    matches: matchCountRows[0]?.value ?? 0
  };
  const rows = {
    stages: stageRows.slice(0, limit),
    groups: groupRows.slice(0, limit).map((row) => row.group),
    spots: spotRows.slice(0, limit),
    routes: routeRows.slice(0, limit),
    rounds: roundRows.slice(0, limit),
    matches: matchRows.slice(0, limit)
  };
  const projectedStageIds = new Set(rows.stages.map((stage) => stage.id));
  const projectedGroupIds = new Set(rows.groups.map((group) => group.id));
  const projectedSpotIds = new Set(rows.spots.map((spot) => spot.id));
  const projectedMatchIds = new Set(rows.matches.map((match) => match.id));
  const referencedStageIds = new Set([
    ...rows.spots.map((spot) => spot.stageId),
    ...rows.rounds
      .map((round) => round.stageId)
      .filter((id): id is number => id !== null),
    ...rows.matches.map((match) => match.stageId)
  ]);
  const referencedSpotIds = new Set([
    ...rows.routes.map((route) => route.destinationSpotId),
    ...rows.matches.flatMap((match) => [match.sideASpotId, match.sideBSpotId])
  ]);
  const referencedMatchIds = new Set(
    rows.routes
      .map((route) => route.sourceMatchId)
      .filter((id): id is number => id !== null)
  );
  const referencedGroupIds = new Set(
    [
      ...rows.spots.map((spot) => spot.groupId),
      ...rows.routes.map((route) => route.sourceGroupId),
      ...rows.matches.map((match) => match.groupId)
    ].filter((id): id is number => id !== null)
  );
  const missingStageIds = [...referencedStageIds].filter(
    (id) => !projectedStageIds.has(id)
  );
  const missingSpotIds = [...referencedSpotIds].filter(
    (id) => !projectedSpotIds.has(id)
  );
  const missingMatchIds = [...referencedMatchIds].filter(
    (id) => !projectedMatchIds.has(id)
  );
  const missingGroupIds = [...referencedGroupIds].filter(
    (id) => !projectedGroupIds.has(id)
  );
  const [
    referencedStages,
    referencedSpots,
    referencedMatches,
    referencedGroups
  ] = await Promise.all([
    missingStageIds.length
      ? database
          .select()
          .from(championshipStages)
          .where(inArray(championshipStages.id, missingStageIds))
      : [],
    missingSpotIds.length
      ? database
          .select()
          .from(championshipSpots)
          .where(inArray(championshipSpots.id, missingSpotIds))
      : [],
    missingMatchIds.length
      ? database
          .select()
          .from(championshipMatches)
          .where(inArray(championshipMatches.id, missingMatchIds))
      : [],
    missingGroupIds.length
      ? database
          .select()
          .from(championshipGroups)
          .where(inArray(championshipGroups.id, missingGroupIds))
      : []
  ]);
  const teamIds = new Set<number>();
  const programIds = new Set<number>();

  for (const spot of rows.spots) {
    if (spot.currentTeamId) teamIds.add(spot.currentTeamId);
  }
  for (const match of rows.matches) {
    if (match.sideATeamId) teamIds.add(match.sideATeamId);
    if (match.sideBTeamId) teamIds.add(match.sideBTeamId);
    if (match.roomProgramId) programIds.add(match.roomProgramId);
  }
  const associationIds = rows.stages
    .map((stage) => stage.defaultChampionshipRoomProgramId)
    .filter((id): id is number => id !== null);
  const associations =
    associationIds.length > 0
      ? await database
          .select()
          .from(championshipRoomPrograms)
          .where(inArray(championshipRoomPrograms.id, associationIds))
      : [];

  for (const association of associations) {
    programIds.add(association.roomProgramId);
  }

  const [teamRows, programRows] = await Promise.all([
    teamIds.size
      ? database
          .select()
          .from(championshipTeams)
          .where(inArray(championshipTeams.id, [...teamIds]))
      : [],
    programIds.size
      ? database
          .select()
          .from(roomPrograms)
          .where(inArray(roomPrograms.id, [...programIds]))
      : []
  ]);
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const programById = new Map(
    programRows.map((program) => [program.id, program])
  );
  const associationById = new Map(
    associations.map((association) => [association.id, association])
  );
  const stageById = new Map(
    [...rows.stages, ...referencedStages].map((stage) => [stage.id, stage])
  );
  const groupById = new Map(
    [...rows.groups, ...referencedGroups].map((group) => [group.id, group])
  );
  const spotById = new Map(
    [...rows.spots, ...referencedSpots].map((spot) => [spot.id, spot])
  );
  const matchById = new Map(
    [...rows.matches, ...referencedMatches].map((match) => [match.id, match])
  );
  const bounded = <T>(items: T[], totalCount: number) => ({
    items,
    totalCount,
    truncated: totalCount > items.length
  });
  const teamReference = (teamId: number | null) => {
    const team = teamId ? teamById.get(teamId) : null;

    return team
      ? {
          uuid: team.uuid,
          name: team.name,
          abbreviation: team.abbreviation,
          colors: team.colors
        }
      : null;
  };

  return {
    championshipUuid: championship.uuid,
    championshipRevision: championship.revision,
    limit,
    stages: bounded(
      rows.stages.map((stage) => {
        const association = stage.defaultChampionshipRoomProgramId
          ? associationById.get(stage.defaultChampionshipRoomProgramId)
          : null;
        const program = association
          ? programById.get(association.roomProgramId)
          : null;

        return {
          uuid: stage.uuid,
          name: stage.name,
          displayOrder: stage.displayOrder,
          engine: stage.engine,
          state: stage.state,
          configSchemaVersion: stage.configSchemaVersion,
          config: stage.config,
          defaultRoomProgram: program
            ? { uuid: program.uuid, name: program.name }
            : null,
          revision: stage.revision,
          createdAt: stage.createdAt,
          updatedAt: stage.updatedAt
        };
      }),
      totals.stages
    ),
    groups: bounded(
      rows.groups.map((group) => ({
        uuid: group.uuid,
        stageUuid: stageById.get(group.stageId)!.uuid,
        name: group.name,
        displayOrder: group.displayOrder,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      })),
      totals.groups
    ),
    spots: bounded(
      rows.spots.map((spot) => ({
        uuid: spot.uuid,
        stageUuid: stageById.get(spot.stageId)!.uuid,
        groupUuid: spot.groupId
          ? (groupById.get(spot.groupId)?.uuid ?? null)
          : null,
        key: spot.key,
        label: spot.label,
        kind: spot.kind,
        displayOrder: spot.displayOrder,
        placementRank: spot.placementRank,
        currentTeam: teamReference(spot.currentTeamId),
        x: spot.x,
        y: spot.y,
        revision: spot.revision,
        createdAt: spot.createdAt,
        updatedAt: spot.updatedAt
      })),
      totals.spots
    ),
    routes: bounded(
      rows.routes.map((route) => ({
        uuid: route.uuid,
        sourceKind: route.sourceKind,
        sourceMatchUuid: route.sourceMatchId
          ? (matchById.get(route.sourceMatchId)?.uuid ?? null)
          : null,
        sourceGroupUuid: route.sourceGroupId
          ? (groupById.get(route.sourceGroupId)?.uuid ?? null)
          : null,
        sourceOutcome: route.sourceOutcome,
        sourceRank: route.sourceRank,
        condition: route.condition,
        destinationSpotUuid: spotById.get(route.destinationSpotId)!.uuid,
        priority: route.priority,
        state: route.state,
        createdAt: route.createdAt,
        updatedAt: route.updatedAt
      })),
      totals.routes
    ),
    competitionRounds: bounded(
      rows.rounds.map((round) => ({
        uuid: round.uuid,
        stageUuid: round.stageId
          ? (stageById.get(round.stageId)?.uuid ?? null)
          : null,
        name: round.name,
        sequence: round.sequence,
        startsAt: round.startsAt,
        endsAt: round.endsAt,
        schedulingAuthority: round.schedulingAuthority,
        latePlayPolicy: round.latePlayPolicy,
        createdAt: round.createdAt,
        updatedAt: round.updatedAt
      })),
      totals.rounds
    ),
    matches: bounded(
      rows.matches.map((match) => {
        const program = match.roomProgramId
          ? programById.get(match.roomProgramId)
          : null;

        return {
          uuid: match.uuid,
          stageUuid: stageById.get(match.stageId)!.uuid,
          groupUuid: match.groupId
            ? (groupById.get(match.groupId)?.uuid ?? null)
            : null,
          label: match.label,
          displayOrder: match.displayOrder,
          sideA: {
            spotUuid: spotById.get(match.sideASpotId)!.uuid,
            team: teamReference(match.sideATeamId)
          },
          sideB: {
            spotUuid: spotById.get(match.sideBSpotId)!.uuid,
            team: teamReference(match.sideBTeamId)
          },
          competitionRoundUuid: match.competitionRoundId
            ? (rows.rounds.find(
                (round) => round.id === match.competitionRoundId
              )?.uuid ?? null)
            : null,
          scheduledAt: match.scheduledAt,
          scheduleStatus: match.scheduleStatus,
          roomProgram: program
            ? { uuid: program.uuid, name: program.name }
            : null,
          matchRulesOverride: match.matchRulesOverride,
          bracket: match.bracket,
          bracketRound: match.bracketRound,
          bracketPosition: match.bracketPosition,
          evidenceRevision: match.evidenceRevision,
          resultRevision: match.resultRevision,
          scheduleRevision: match.scheduleRevision,
          revision: match.revision,
          createdAt: match.createdAt,
          updatedAt: match.updatedAt
        };
      }),
      totals.matches
    )
  };
}

async function resolveTeams(
  database: DatabaseExecutor,
  championshipId: number,
  teamUuids: string[]
) {
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

  if (byUuid.size !== teamUuids.length) {
    throw badRequest("Every bracket team must belong to the championship");
  }

  return teamUuids.map((uuid) => byUuid.get(uuid)!);
}

async function calculateSpotPlacementImpact(
  database: DatabaseExecutor,
  championship: Championship,
  targetSpot: typeof championshipSpots.$inferSelect,
  input: {
    teamId: string | null;
    sourceSpotId?: string | null;
  }
) {
  const team = input.teamId
    ? await requireTeam(database, championship.id, input.teamId)
    : null;
  const sourceSpot = input.sourceSpotId
    ? await requireSpot(database, championship.id, input.sourceSpotId)
    : null;

  if (sourceSpot && !team) {
    throw badRequest("A source spot can only be supplied when moving a team");
  }
  if (sourceSpot?.id === targetSpot.id) {
    throw badRequest("Source and target spots must be different");
  }
  if (sourceSpot && sourceSpot.stageId !== targetSpot.stageId) {
    throw badRequest("Teams can only be moved between spots in the same stage");
  }
  if (sourceSpot && sourceSpot.currentTeamId !== team?.id) {
    throw conflict("The selected team no longer occupies the source spot", {
      sourceSpotUuid: sourceSpot.uuid,
      currentTeamId: sourceSpot.currentTeamId
    });
  }

  const [matchRows, routeRows, currentTeams] = await Promise.all([
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
      .where(eq(championshipTeams.championshipId, championship.id))
  ]);
  const changedSpotIds = [
    ...(sourceSpot && sourceSpot.currentTeamId !== null ? [sourceSpot.id] : []),
    ...(targetSpot.currentTeamId !== (team?.id ?? null) ? [targetSpot.id] : [])
  ];
  const cascade = calculateCorrectionCascade(
    -1,
    changedSpotIds,
    matchRows,
    routeRows.flatMap((route) =>
      route.sourceMatchId === null
        ? []
        : [
            {
              sourceMatchId: route.sourceMatchId,
              destinationSpotId: route.destinationSpotId
            }
          ]
    )
  );

  if (cascade.length > 500) {
    throw badRequest(
      "Spot placement affects more than 500 matches; split the format correction"
    );
  }

  const teamById = new Map(currentTeams.map((item) => [item.id, item]));
  const teamReference = (teamId: number | null) => {
    const item = teamId ? teamById.get(teamId) : null;
    return item
      ? {
          uuid: item.uuid,
          name: item.name,
          abbreviation: item.abbreviation,
          colors: item.colors
        }
      : null;
  };
  const endpoint = (
    spot: typeof championshipSpots.$inferSelect,
    nextTeamId: number | null
  ) => ({
    uuid: spot.uuid,
    label: spot.label,
    revision: spot.revision,
    previousTeam: teamReference(spot.currentTeamId),
    nextTeam: teamReference(nextTeamId)
  });
  const affectedMatches = cascade.map(({ match, depth }) => ({
    matchUuid: match.uuid,
    label: match.label,
    depth,
    hadResult: match.resultRevision > 0,
    hadEvidence: match.evidenceRevision > 0
  }));

  return {
    targetSpot,
    sourceSpot,
    team,
    affectedMatchUuids: affectedMatches.map((match) => match.matchUuid),
    response: {
      championshipUuid: championship.uuid,
      championshipRevision: championship.revision,
      targetSpot: endpoint(targetSpot, team?.id ?? null),
      sourceSpot: sourceSpot ? endpoint(sourceSpot, null) : null,
      affectedMatches,
      requiresConfirmation: affectedMatches.length > 0
    } satisfies ChampionshipSpotPlacementPreviewResponse
  };
}

function assertConfirmedSpotImpact(confirmed: string[], actual: string[]) {
  const expected = [...actual].sort();
  const received = [...confirmed].sort();

  if (
    expected.length !== received.length ||
    expected.some((uuid, index) => uuid !== received[index])
  ) {
    throw conflict("Spot placement impact changed; preview it again", {
      expectedImpactMatchUuids: expected,
      confirmedImpactMatchUuids: received
    });
  }
}

async function requireTeam(
  database: DatabaseExecutor,
  championshipId: number,
  teamUuid: string
) {
  const [team] = await database
    .select()
    .from(championshipTeams)
    .where(
      and(
        eq(championshipTeams.championshipId, championshipId),
        eq(championshipTeams.uuid, teamUuid)
      )
    );

  if (!team) throw notFound("Championship team not found");
  return team;
}

async function requireStage(
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
  return stage;
}

async function requireStageById(database: DatabaseExecutor, stageId: number) {
  const [stage] = await database
    .select()
    .from(championshipStages)
    .where(eq(championshipStages.id, stageId));

  if (!stage) throw notFound("Championship stage not found");
  return stage;
}

async function requireSpot(
  database: DatabaseExecutor,
  championshipId: number,
  spotUuid: string
) {
  const [spot] = await database
    .select()
    .from(championshipSpots)
    .where(
      and(
        eq(championshipSpots.championshipId, championshipId),
        eq(championshipSpots.uuid, spotUuid)
      )
    );

  if (!spot) throw notFound("Championship spot not found");
  return spot;
}

async function requireFormatMatch(
  database: DatabaseExecutor,
  championshipId: number,
  matchUuid: string
) {
  const [match] = await database
    .select()
    .from(championshipMatches)
    .where(
      and(
        eq(championshipMatches.championshipId, championshipId),
        eq(championshipMatches.uuid, matchUuid)
      )
    );

  if (!match) throw notFound("Championship match not found");
  return match;
}

async function requireCompetitionRound(
  database: DatabaseExecutor,
  championshipId: number,
  roundUuid: string
) {
  const [round] = await database
    .select()
    .from(championshipCompetitionRounds)
    .where(
      and(
        eq(championshipCompetitionRounds.championshipId, championshipId),
        eq(championshipCompetitionRounds.uuid, roundUuid)
      )
    );

  if (!round) throw notFound("Competition round not found");
  return round;
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

async function requireChampionshipGroup(
  database: DatabaseExecutor,
  championshipId: number,
  groupUuid: string
) {
  const [group] = await database
    .select({ group: championshipGroups })
    .from(championshipGroups)
    .innerJoin(
      championshipStages,
      eq(championshipGroups.stageId, championshipStages.id)
    )
    .where(
      and(
        eq(championshipStages.championshipId, championshipId),
        eq(championshipGroups.uuid, groupUuid)
      )
    );

  if (!group) throw notFound("Championship group not found");
  return group.group;
}

async function resolveChampionshipProgram(
  database: DatabaseExecutor,
  championshipId: number,
  roomProgramUuid: string | null | undefined
) {
  if (roomProgramUuid === null) {
    return null;
  }

  const conditions = [
    eq(championshipRoomPrograms.championshipId, championshipId),
    eq(championshipRoomPrograms.state, "active")
  ];

  if (roomProgramUuid) {
    conditions.push(eq(roomPrograms.uuid, roomProgramUuid));
  } else {
    conditions.push(eq(championshipRoomPrograms.isDefault, true));
  }

  const [row] = await database
    .select({
      associationId: championshipRoomPrograms.id,
      roomProgramId: roomPrograms.id,
      roomProgramUuid: roomPrograms.uuid,
      roomProgramName: roomPrograms.name
    })
    .from(championshipRoomPrograms)
    .innerJoin(
      roomPrograms,
      eq(championshipRoomPrograms.roomProgramId, roomPrograms.id)
    )
    .where(and(...conditions));

  if (roomProgramUuid && !row) {
    throw badRequest("Room program is not active for this championship");
  }

  return row ?? null;
}

async function resolveMatchProgram(
  database: DatabaseExecutor,
  championshipId: number,
  stageAssociationId: number | null,
  roomProgramUuid: string | null | undefined
) {
  if (roomProgramUuid !== undefined) {
    return resolveChampionshipProgram(
      database,
      championshipId,
      roomProgramUuid
    );
  }

  if (stageAssociationId) {
    const [association] = await database
      .select()
      .from(championshipRoomPrograms)
      .where(
        and(
          eq(championshipRoomPrograms.id, stageAssociationId),
          eq(championshipRoomPrograms.championshipId, championshipId),
          eq(championshipRoomPrograms.state, "active")
        )
      );

    if (association) {
      return {
        associationId: association.id,
        roomProgramId: association.roomProgramId
      };
    }
  }

  return resolveChampionshipProgram(database, championshipId, undefined);
}

async function nextStageDisplayOrder(
  database: DatabaseExecutor,
  championshipId: number
): Promise<number> {
  const [row] = await database
    .select({ maximum: sql<number>`max(${championshipStages.displayOrder})` })
    .from(championshipStages)
    .where(eq(championshipStages.championshipId, championshipId));

  return row?.maximum === null || row?.maximum === undefined
    ? 0
    : row.maximum + 1;
}

async function nextSpotDisplayOrder(
  database: DatabaseExecutor,
  stageId: number
): Promise<number> {
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
): Promise<number> {
  const [row] = await database
    .select({ maximum: sql<number>`max(${championshipMatches.displayOrder})` })
    .from(championshipMatches)
    .where(eq(championshipMatches.stageId, stageId));

  return row?.maximum === null || row?.maximum === undefined
    ? 0
    : row.maximum + 1;
}

async function nextCompetitionRoundSequence(
  database: DatabaseExecutor,
  championshipId: number
): Promise<number> {
  const [row] = await database
    .select({
      maximum: sql<number>`max(${championshipCompetitionRounds.sequence})`
    })
    .from(championshipCompetitionRounds)
    .where(eq(championshipCompetitionRounds.championshipId, championshipId));

  return row?.maximum === null || row?.maximum === undefined
    ? 1
    : row.maximum + 1;
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

function validateDateRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined
) {
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw badRequest("Competition round end must be after its start");
  }
}

function validateRouteSource(input: CreateChampionshipRouteInput) {
  if (
    input.sourceKind === "match-outcome" &&
    (!input.sourceMatchId ||
      !input.sourceOutcome ||
      input.sourceOutcome === "rank")
  ) {
    throw badRequest(
      "Match routes require a match and winner or loser outcome"
    );
  }
  if (
    input.sourceKind === "classification-rank" &&
    (!input.sourceGroupId ||
      input.sourceOutcome !== "rank" ||
      !input.sourceRank)
  ) {
    throw badRequest("Classification routes require a group and rank");
  }
}

function roundName(round: number, roundCount: number): string {
  const remaining = roundCount - round;

  if (remaining === 0) return "Final";
  if (remaining === 1) return "Semifinais";
  if (remaining === 2) return "Quartas de final";
  if (remaining === 3) return "Oitavas de final";
  return `Fase ${round}`;
}

async function createGeneratedCompetitionRounds(
  database: DatabaseExecutor,
  championship: Championship,
  stageId: number,
  plan: DoubleEliminationPlan,
  input: Pick<
    GenerateDoubleEliminationInput,
    | "createCompetitionRounds"
    | "competitionRoundMode"
    | "firstRoundStartsAt"
    | "roundDurationHours"
  >
): Promise<Map<string, number>> {
  if (!(input.createCompetitionRounds ?? true)) {
    return new Map();
  }

  const depthByMatchKey = bracketMatchDepths(plan);
  const maximumDepth = Math.max(...depthByMatchKey.values());
  const firstSequence = await nextCompetitionRoundSequence(
    database,
    championship.id
  );
  const start = input.firstRoundStartsAt
    ? new Date(input.firstRoundStartsAt)
    : null;
  const durationMs = (input.roundDurationHours ?? 168) * 60 * 60 * 1_000;
  if (input.competitionRoundMode === "single-period") {
    const [round] = await database
      .insert(championshipCompetitionRounds)
      .values({
        championshipId: championship.id,
        stageId,
        name: "Evento principal",
        sequence: firstSequence,
        startsAt: start?.toISOString() ?? null,
        endsAt: start
          ? new Date(start.getTime() + durationMs).toISOString()
          : null,
        schedulingAuthority: championship.rules.scheduling.authority,
        latePlayPolicy: championship.rules.scheduling.latePlayPolicy
      })
      .returning();

    return new Map(plan.matches.map((match) => [match.key, round.id]));
  }
  const roundIdByDepth = new Map<number, number>();

  for (let depth = 1; depth <= maximumDepth; depth += 1) {
    const startsAt = start
      ? new Date(start.getTime() + (depth - 1) * durationMs)
      : null;
    const [round] = await database
      .insert(championshipCompetitionRounds)
      .values({
        championshipId: championship.id,
        stageId,
        name: `Rodada ${depth}`,
        sequence: firstSequence + depth - 1,
        startsAt: startsAt?.toISOString() ?? null,
        endsAt: startsAt
          ? new Date(startsAt.getTime() + durationMs).toISOString()
          : null,
        schedulingAuthority: championship.rules.scheduling.authority,
        latePlayPolicy: championship.rules.scheduling.latePlayPolicy
      })
      .returning();

    roundIdByDepth.set(depth, round.id);
  }

  return new Map(
    [...depthByMatchKey].map(([matchKey, depth]) => [
      matchKey,
      roundIdByDepth.get(depth)!
    ])
  );
}

function bracketMatchDepths(
  plan: Pick<DoubleEliminationPlan, "matches" | "routes">
): Map<string, number> {
  const matchBySpot = new Map<string, string>();
  const dependencies = new Map<string, Set<string>>();

  for (const match of plan.matches) {
    matchBySpot.set(match.sideASpotKey, match.key);
    matchBySpot.set(match.sideBSpotKey, match.key);
    dependencies.set(match.key, new Set());
  }
  for (const route of plan.routes) {
    const destinationMatch = matchBySpot.get(route.destinationSpotKey);
    if (destinationMatch) {
      dependencies.get(destinationMatch)!.add(route.sourceMatchKey);
    }
  }

  const depthByMatch = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (matchKey: string): number => {
    const existing = depthByMatch.get(matchKey);
    if (existing) return existing;
    if (visiting.has(matchKey)) {
      throw badRequest("Generated bracket contains a progression cycle");
    }
    visiting.add(matchKey);
    const dependenciesForMatch = dependencies.get(matchKey) ?? new Set();
    const depth =
      dependenciesForMatch.size === 0
        ? 1
        : 1 + Math.max(...[...dependenciesForMatch].map(visit));
    visiting.delete(matchKey);
    depthByMatch.set(matchKey, depth);
    return depth;
  };

  for (const match of plan.matches) visit(match.key);
  return depthByMatch;
}
