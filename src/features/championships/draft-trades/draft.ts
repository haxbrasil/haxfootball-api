import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  type DatabaseExecutor,
  type DbTransaction,
  withDatabaseTransaction
} from "@/db/client";
import type {
  ChampionshipDraftQuery,
  ConfigureChampionshipDraftInput,
  EndChampionshipDraftInput,
  MakeChampionshipDraftPickInput,
  StartChampionshipDraftInput,
  VoidChampionshipDraftPickInput
} from "@/features/championships/_shared/http/inputs";
import type {
  ChampionshipDraftCorrectionPreviewResponse,
  ChampionshipDraftResponse
} from "@/features/championships/_shared/http/responses";
import {
  championshipActorHasPermission,
  findChampionshipActor,
  requireChampionshipActor,
  type ChampionshipActor
} from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  championshipAuditEvents,
  championshipOutboxEvents,
  championships,
  type Championship
} from "@/features/championships/core/db";
import {
  championshipDraftOrder,
  championshipDrafts,
  championshipDraftTurns,
  type ChampionshipDraft
} from "@/features/championships/draft-trades/db";
import {
  draftTurnDeadline,
  generateSerpentineTurns,
  reopenedDraftTurnState
} from "@/features/championships/draft-trades/draft-engine";
import { championshipParticipantPrices } from "@/features/championships/finance/db";
import {
  championshipParticipants,
  championshipTeamMemberships,
  championshipTeams
} from "@/features/championships/people/db";
import { applyChampionshipRosterMove } from "@/features/championships/people/rosters";
import { jobs } from "@/features/jobs/db";
import { badRequest, conflict, notFound } from "@/shared/http/errors";
import { decodeCursor, encodeCursor } from "@lib";
import type { JsonValue } from "@lib/json";

const draftAdvanceJobType = "championships.advance-draft";
const defaultTurnLimit = 100;
const defaultParticipantLimit = 100;

export async function getChampionshipDraft(
  championshipUuid: string,
  query: ChampionshipDraftQuery = {}
): Promise<ChampionshipDraftResponse> {
  await catchUpChampionshipDraft(championshipUuid, new Date(), "request");

  const [championship] = await db
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  return projectChampionshipDraft(db, championship, query);
}

export async function configureChampionshipDraft(
  championshipUuid: string,
  input: ConfigureChampionshipDraftInput
): Promise<ChampionshipDraftResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "draft.configured"
    },
    async (tx, championship) => {
      if (championship.lifecycle !== "setup") {
        throw conflict("Draft setup is locked after the championship starts");
      }

      const teams = await resolveOrderedTeams(
        tx,
        championship.id,
        input.teamIds
      );
      const [existingDraft] = await tx
        .select()
        .from(championshipDrafts)
        .where(eq(championshipDrafts.championshipId, championship.id));

      if (existingDraft && existingDraft.state !== "setup") {
        throw conflict("Draft order is immutable after the draft starts", {
          draftRevision: existingDraft.revision,
          draftState: existingDraft.state
        });
      }

      const now = new Date().toISOString();
      let draft: ChampionshipDraft;

      if (existingDraft) {
        await tx
          .delete(championshipDraftTurns)
          .where(eq(championshipDraftTurns.draftId, existingDraft.id));
        await tx
          .delete(championshipDraftOrder)
          .where(eq(championshipDraftOrder.draftId, existingDraft.id));
        [draft] = await tx
          .update(championshipDrafts)
          .set({
            rounds: input.rounds,
            countdownSeconds: input.countdownSeconds,
            nextTurnSequence: 1,
            revision: existingDraft.revision + 1,
            updatedAt: now
          })
          .where(eq(championshipDrafts.id, existingDraft.id))
          .returning();
      } else {
        [draft] = await tx
          .insert(championshipDrafts)
          .values({
            championshipId: championship.id,
            rounds: input.rounds,
            countdownSeconds: input.countdownSeconds,
            createdAt: now,
            updatedAt: now
          })
          .returning();
      }

      await tx.insert(championshipDraftOrder).values(
        teams.map((team, index) => ({
          draftId: draft.id,
          teamId: team.id,
          position: index + 1
        }))
      );
      const turnValues = generateSerpentineTurns(
        teams.length,
        input.rounds
      ).map((turn) => ({
        draftId: draft.id,
        sequence: turn.sequence,
        round: turn.round,
        position: turn.position,
        teamId: teams[turn.teamIndex]!.id
      }));

      for (const batch of chunks(turnValues, 100)) {
        await tx.insert(championshipDraftTurns).values(batch);
      }

      const response = await projectChampionshipDraft(
        tx,
        championship,
        projectionQuery(input.actorAccountUuid)
      );

      return {
        response: () => response,
        targetType: "draft",
        targetUuid: draft.uuid,
        before: existingDraft
          ? {
              rounds: existingDraft.rounds,
              countdownSeconds: existingDraft.countdownSeconds
            }
          : null,
        after: {
          rounds: input.rounds,
          countdownSeconds: input.countdownSeconds,
          teamIds: input.teamIds,
          turnCount: turnValues.length
        },
        outboxTopic: "championship.draft.configured"
      };
    }
  );
}

export async function startChampionshipDraft(
  championshipUuid: string,
  input: StartChampionshipDraftInput
): Promise<ChampionshipDraftResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "draft.started"
    },
    async (tx, championship) => {
      const draft = await requireDraft(tx, championship.id);
      requireDraftRevision(draft, input.expectedDraftRevision);

      if (draft.state !== "setup") {
        throw conflict("Only a configured draft can be started", {
          draftState: draft.state
        });
      }

      if (championship.registrationState !== "closed") {
        throw conflict("Registration must be closed before the draft starts");
      }

      if (
        championship.rules.salary.enabled &&
        championship.priceState !== "locked"
      ) {
        throw conflict(
          "Participant values must be frozen before the draft starts"
        );
      }

      const order = await tx
        .select({
          team: championshipTeams,
          position: championshipDraftOrder.position
        })
        .from(championshipDraftOrder)
        .innerJoin(
          championshipTeams,
          eq(championshipDraftOrder.teamId, championshipTeams.id)
        )
        .where(eq(championshipDraftOrder.draftId, draft.id))
        .orderBy(asc(championshipDraftOrder.position));

      if (order.length < 2) {
        throw conflict("Drafts require at least two teams");
      }

      const gmRows = await tx
        .select({ teamId: championshipTeamMemberships.teamId })
        .from(championshipTeamMemberships)
        .where(
          and(
            inArray(
              championshipTeamMemberships.teamId,
              order.map(({ team }) => team.id)
            ),
            eq(championshipTeamMemberships.role, "gm"),
            isNull(championshipTeamMemberships.endedAt)
          )
        );
      const teamsWithGm = new Set(gmRows.map(({ teamId }) => teamId));
      const missingGms = order
        .filter(({ team }) => !teamsWithGm.has(team.id))
        .map(({ team }) => ({ uuid: team.uuid, name: team.name }));

      if (missingGms.length > 0) {
        throw conflict("Every draft team needs an active GM", {
          missingGms
        });
      }

      const [firstTurn] = await tx
        .select()
        .from(championshipDraftTurns)
        .where(eq(championshipDraftTurns.draftId, draft.id))
        .orderBy(asc(championshipDraftTurns.sequence))
        .limit(1);

      if (!firstTurn) {
        throw conflict("The draft has no materialized turns");
      }

      const openedAt = new Date();
      const deadlineAt = draftTurnDeadline(openedAt, draft.countdownSeconds);
      await tx
        .update(championshipDraftTurns)
        .set({
          state: "open",
          openedAt: openedAt.toISOString(),
          deadlineAt,
          revision: firstTurn.revision + 1,
          updatedAt: openedAt.toISOString()
        })
        .where(eq(championshipDraftTurns.id, firstTurn.id));
      const [updatedDraft] = await tx
        .update(championshipDrafts)
        .set({
          state: "live",
          nextTurnSequence: firstTurn.sequence,
          revision: draft.revision + 1,
          startedAt: openedAt.toISOString(),
          updatedAt: openedAt.toISOString()
        })
        .where(eq(championshipDrafts.id, draft.id))
        .returning();

      await scheduleDraftAdvance(tx, updatedDraft.uuid, deadlineAt);
      const response = await projectChampionshipDraft(
        tx,
        championship,
        projectionQuery(input.actorAccountUuid)
      );

      return {
        response: () => response,
        targetType: "draft",
        targetUuid: draft.uuid,
        before: { state: draft.state, revision: draft.revision },
        after: {
          state: updatedDraft.state,
          revision: updatedDraft.revision,
          firstTurnUuid: firstTurn.uuid,
          deadlineAt
        },
        outboxTopic: "championship.draft.started"
      };
    }
  );
}

export async function makeChampionshipDraftPick(
  championshipUuid: string,
  input: MakeChampionshipDraftPickInput
): Promise<ChampionshipDraftResponse> {
  await catchUpChampionshipDraft(championshipUuid, new Date(), "request");

  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      authorize: async () => undefined,
      action: "draft.pick-made"
    },
    async (tx, championship, actor) => {
      const draft = await requireDraft(tx, championship.id);
      requireDraftRevision(draft, input.expectedDraftRevision);

      if (draft.state !== "live") {
        throw conflict(
          "Draft picks are available only while the draft is live"
        );
      }

      const actorControl = await resolveDraftActorControl(
        tx,
        championship,
        draft,
        actor
      );
      const eligibleTurns = await tx
        .select({
          turn: championshipDraftTurns,
          team: championshipTeams
        })
        .from(championshipDraftTurns)
        .innerJoin(
          championshipTeams,
          eq(championshipDraftTurns.teamId, championshipTeams.id)
        )
        .where(
          and(
            eq(championshipDraftTurns.draftId, draft.id),
            inArray(championshipDraftTurns.state, ["open", "overdue"]),
            input.teamId
              ? eq(championshipTeams.uuid, input.teamId)
              : actorControl.canManage
                ? undefined
                : actorControl.gmTeamIds.length > 0
                  ? inArray(championshipTeams.uuid, actorControl.gmTeamIds)
                  : sql`0 = 1`
          )
        )
        .orderBy(asc(championshipDraftTurns.sequence));
      const selected = eligibleTurns[0];

      if (!selected) {
        throw conflict("The actor has no eligible draft turn");
      }

      if (
        !actorControl.canManage &&
        !actorControl.gmTeamIds.includes(selected.team.uuid)
      ) {
        throw conflict("Only an active team GM can make this pick");
      }

      const applied = await applyChampionshipRosterMove(tx, championship, {
        participantId: input.participantId,
        targetTeamId: selected.team.uuid,
        role: "player",
        acquisitionSource: "draft",
        acquisitionReferenceUuid: selected.turn.uuid,
        actorAccountId: actor.account.id
      });
      const pickedAt = new Date();
      await tx
        .update(championshipDraftTurns)
        .set({
          state: "filled",
          selectedParticipantId: await participantInternalId(
            tx,
            championship.id,
            input.participantId
          ),
          priceUnitsSnapshot: applied.membership.priceUnitsSnapshot,
          filledAt: pickedAt.toISOString(),
          selectedByAccountId: actor.account.id,
          revision: selected.turn.revision + 1,
          updatedAt: pickedAt.toISOString()
        })
        .where(
          and(
            eq(championshipDraftTurns.id, selected.turn.id),
            inArray(championshipDraftTurns.state, ["open", "overdue"])
          )
        );

      let nextTurnUuid: string | null = null;
      let nextDeadlineAt: string | null = null;
      let nextTurnSequence = draft.nextTurnSequence;

      if (selected.turn.sequence === draft.nextTurnSequence) {
        const [nextTurn] = await tx
          .select()
          .from(championshipDraftTurns)
          .where(
            and(
              eq(championshipDraftTurns.draftId, draft.id),
              eq(championshipDraftTurns.state, "pending"),
              gt(championshipDraftTurns.sequence, selected.turn.sequence)
            )
          )
          .orderBy(asc(championshipDraftTurns.sequence))
          .limit(1);

        if (nextTurn) {
          nextTurnUuid = nextTurn.uuid;
          nextTurnSequence = nextTurn.sequence;
          nextDeadlineAt = draftTurnDeadline(pickedAt, draft.countdownSeconds);
          await tx
            .update(championshipDraftTurns)
            .set({
              state: "open",
              openedAt: pickedAt.toISOString(),
              deadlineAt: nextDeadlineAt,
              revision: nextTurn.revision + 1,
              updatedAt: pickedAt.toISOString()
            })
            .where(eq(championshipDraftTurns.id, nextTurn.id));
        } else {
          nextTurnSequence = (await maximumDraftTurnSequence(tx, draft.id)) + 1;
        }
      }

      const [{ remaining }] = await tx
        .select({
          remaining: sql<number>`count(*)`
        })
        .from(championshipDraftTurns)
        .where(
          and(
            eq(championshipDraftTurns.draftId, draft.id),
            inArray(championshipDraftTurns.state, [
              "pending",
              "open",
              "overdue"
            ])
          )
        );
      const completed = Number(remaining) === 0;
      const [updatedDraft] = await tx
        .update(championshipDrafts)
        .set({
          state: completed ? "completed" : "live",
          nextTurnSequence,
          revision: draft.revision + 1,
          completedAt: completed ? pickedAt.toISOString() : null,
          updatedAt: pickedAt.toISOString()
        })
        .where(eq(championshipDrafts.id, draft.id))
        .returning();

      await scheduleDraftAdvance(tx, updatedDraft.uuid, nextDeadlineAt);
      const response = await projectChampionshipDraft(
        tx,
        championship,
        projectionQuery(input.actorAccountUuid)
      );

      return {
        response: () => response,
        targetType: "draft-turn",
        targetUuid: selected.turn.uuid,
        before: {
          state: selected.turn.state,
          teamUuid: selected.team.uuid
        },
        after: {
          state: "filled",
          participantUuid: input.participantId,
          membershipUuid: applied.membership.uuid
        },
        metadata: {
          draftUuid: draft.uuid,
          draftRevision: updatedDraft.revision,
          nextTurnUuid,
          nextDeadlineAt
        },
        outboxTopic: "championship.draft.pick-made"
      };
    }
  );
}

export async function endChampionshipDraft(
  championshipUuid: string,
  input: EndChampionshipDraftInput
): Promise<ChampionshipDraftResponse> {
  await catchUpChampionshipDraft(championshipUuid, new Date(), "request");

  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "draft.ended"
    },
    async (tx, championship) => {
      const draft = await requireDraft(tx, championship.id);
      requireDraftRevision(draft, input.expectedDraftRevision);

      if (draft.state !== "live") {
        throw conflict("Only a live draft can be ended");
      }

      const now = new Date().toISOString();
      const unfilled = await tx
        .select({ uuid: championshipDraftTurns.uuid })
        .from(championshipDraftTurns)
        .where(
          and(
            eq(championshipDraftTurns.draftId, draft.id),
            inArray(championshipDraftTurns.state, [
              "pending",
              "open",
              "overdue"
            ])
          )
        );
      await tx
        .update(championshipDraftTurns)
        .set({
          state: "voided",
          deadlineAt: null,
          revision: sql`${championshipDraftTurns.revision} + 1`,
          updatedAt: now
        })
        .where(
          and(
            eq(championshipDraftTurns.draftId, draft.id),
            inArray(championshipDraftTurns.state, [
              "pending",
              "open",
              "overdue"
            ])
          )
        );
      const [updatedDraft] = await tx
        .update(championshipDrafts)
        .set({
          state: "completed",
          nextTurnSequence: (await maximumDraftTurnSequence(tx, draft.id)) + 1,
          revision: draft.revision + 1,
          completedAt: now,
          updatedAt: now
        })
        .where(eq(championshipDrafts.id, draft.id))
        .returning();
      const response = await projectChampionshipDraft(
        tx,
        championship,
        projectionQuery(input.actorAccountUuid)
      );

      return {
        response: () => response,
        targetType: "draft",
        targetUuid: draft.uuid,
        before: { state: draft.state, revision: draft.revision },
        after: {
          state: updatedDraft.state,
          revision: updatedDraft.revision,
          voidedTurnIds: unfilled.map(({ uuid }) => uuid)
        },
        reason: input.reason,
        outboxTopic: "championship.draft.ended"
      };
    }
  );
}

export async function getChampionshipDraftCorrectionPreview(
  championshipUuid: string,
  turnUuid: string,
  actorAccountUuid: string
): Promise<ChampionshipDraftCorrectionPreviewResponse> {
  await catchUpChampionshipDraft(championshipUuid, new Date(), "request");
  const [championship] = await db
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  await requireChampionshipActor(db, {
    actorAccountUuid,
    permission: "championship:admin",
    championshipId: championship.id
  });

  return buildDraftCorrectionPreview(db, championship, turnUuid);
}

export async function voidChampionshipDraftPick(
  championshipUuid: string,
  turnUuid: string,
  input: VoidChampionshipDraftPickInput
): Promise<ChampionshipDraftResponse> {
  await catchUpChampionshipDraft(championshipUuid, new Date(), "request");

  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "draft.pick-reversed"
    },
    async (tx, championship, actor) => {
      const draft = await requireDraft(tx, championship.id);
      requireDraftRevision(draft, input.expectedDraftRevision);
      const preview = await buildDraftCorrectionPreview(
        tx,
        championship,
        turnUuid
      );

      if (!preview.canReverse || !preview.participant) {
        throw conflict("Draft pick cannot be reversed safely", { preview });
      }

      const applied = await applyChampionshipRosterMove(tx, championship, {
        participantId: preview.participant.uuid,
        targetTeamId: null,
        role: "player",
        acquisitionSource: "staff",
        actorAccountId: actor.account.id,
        allowCapException: true,
        reason: input.reason
      });
      const [turn] = await tx
        .select()
        .from(championshipDraftTurns)
        .where(
          and(
            eq(championshipDraftTurns.draftId, draft.id),
            eq(championshipDraftTurns.uuid, turnUuid)
          )
        );
      const now = new Date().toISOString();
      await tx
        .update(championshipDraftTurns)
        .set({
          state: preview.reopenedState,
          selectedParticipantId: null,
          priceUnitsSnapshot: null,
          deadlineAt: null,
          overdueAt:
            preview.reopenedState === "overdue" ? now : turn?.overdueAt,
          filledAt: null,
          selectedByAccountId: null,
          revision: (turn?.revision ?? 0) + 1,
          updatedAt: now
        })
        .where(eq(championshipDraftTurns.id, turn!.id));
      const [updatedDraft] = await tx
        .update(championshipDrafts)
        .set({
          state: "live",
          revision: draft.revision + 1,
          completedAt: null,
          updatedAt: now
        })
        .where(eq(championshipDrafts.id, draft.id))
        .returning();
      const response = await projectChampionshipDraft(
        tx,
        championship,
        projectionQuery(input.actorAccountUuid)
      );

      return {
        response: () => response,
        targetType: "draft-turn",
        targetUuid: turnUuid,
        before: {
          state: turn!.state,
          participantUuid: preview.participant.uuid
        },
        after: {
          state: preview.reopenedState,
          participantUuid: null
        },
        reason: input.reason,
        metadata: {
          draftRevision: updatedDraft.revision,
          endedMembershipUuid: applied.membership.uuid,
          preview
        },
        outboxTopic: "championship.draft.pick-reversed"
      };
    }
  );
}

export async function catchUpChampionshipDraft(
  championshipUuid: string,
  now = new Date(),
  source: "request" | "job" = "request"
): Promise<boolean> {
  return withDatabaseTransaction(async (tx) => {
    const [row] = await tx
      .select({
        championship: championships,
        draft: championshipDrafts
      })
      .from(championships)
      .innerJoin(
        championshipDrafts,
        eq(championshipDrafts.championshipId, championships.id)
      )
      .where(eq(championships.uuid, championshipUuid));

    if (!row || row.draft.state !== "live") {
      return false;
    }

    const [currentTurn] = await tx
      .select()
      .from(championshipDraftTurns)
      .where(
        and(
          eq(championshipDraftTurns.draftId, row.draft.id),
          eq(championshipDraftTurns.sequence, row.draft.nextTurnSequence),
          eq(championshipDraftTurns.state, "open")
        )
      )
      .limit(1);

    if (
      !currentTurn?.deadlineAt ||
      currentTurn.deadlineAt > now.toISOString()
    ) {
      return false;
    }

    const [nextTurn] = await tx
      .select()
      .from(championshipDraftTurns)
      .where(
        and(
          eq(championshipDraftTurns.draftId, row.draft.id),
          eq(championshipDraftTurns.state, "pending"),
          gt(championshipDraftTurns.sequence, currentTurn.sequence)
        )
      )
      .orderBy(asc(championshipDraftTurns.sequence))
      .limit(1);
    const changedAt = now.toISOString();
    await tx
      .update(championshipDraftTurns)
      .set({
        state: "overdue",
        overdueAt: changedAt,
        revision: currentTurn.revision + 1,
        updatedAt: changedAt
      })
      .where(
        and(
          eq(championshipDraftTurns.id, currentTurn.id),
          eq(championshipDraftTurns.state, "open")
        )
      );

    let deadlineAt: string | null = null;
    const nextTurnSequence = nextTurn
      ? nextTurn.sequence
      : (await maximumDraftTurnSequence(tx, row.draft.id)) + 1;

    if (nextTurn) {
      deadlineAt = draftTurnDeadline(now, row.draft.countdownSeconds);
      await tx
        .update(championshipDraftTurns)
        .set({
          state: "open",
          openedAt: changedAt,
          deadlineAt,
          revision: nextTurn.revision + 1,
          updatedAt: changedAt
        })
        .where(eq(championshipDraftTurns.id, nextTurn.id));
    }

    const [updatedDraft] = await tx
      .update(championshipDrafts)
      .set({
        nextTurnSequence,
        revision: row.draft.revision + 1,
        updatedAt: changedAt
      })
      .where(eq(championshipDrafts.id, row.draft.id))
      .returning();
    const nextChampionshipRevision = row.championship.revision + 1;
    const nextSequence = row.championship.changeSequence + 1;
    await tx
      .update(championships)
      .set({
        revision: nextChampionshipRevision,
        changeSequence: nextSequence,
        updatedAt: changedAt
      })
      .where(eq(championships.id, row.championship.id));
    const correlationUuid = crypto.randomUUID();
    const [audit] = await tx
      .insert(championshipAuditEvents)
      .values({
        championshipId: row.championship.id,
        sequence: nextSequence,
        correlationUuid,
        actorKind: "system",
        action: "draft.turn-overdue",
        source,
        targetType: "draft-turn",
        targetUuid: currentTurn.uuid,
        before: {
          state: currentTurn.state,
          deadlineAt: currentTurn.deadlineAt
        },
        after: {
          state: "overdue",
          nextTurnUuid: nextTurn?.uuid ?? null,
          nextDeadlineAt: deadlineAt
        },
        metadata: {
          draftUuid: row.draft.uuid,
          draftRevision: updatedDraft.revision
        }
      })
      .returning();
    await tx.insert(championshipOutboxEvents).values({
      championshipId: row.championship.id,
      auditEventId: audit.id,
      topic: "championship.draft.turn-overdue",
      payload: {
        championshipUuid: row.championship.uuid,
        sequence: nextSequence,
        revision: nextChampionshipRevision,
        action: "draft.turn-overdue",
        targetType: "draft-turn",
        targetUuid: currentTurn.uuid
      }
    });
    await scheduleDraftAdvance(tx, row.draft.uuid, deadlineAt);

    return true;
  });
}

export async function catchUpChampionshipDraftByUuid(
  draftUuid: string,
  now = new Date()
): Promise<boolean> {
  const [row] = await db
    .select({ championshipUuid: championships.uuid })
    .from(championshipDrafts)
    .innerJoin(
      championships,
      eq(championshipDrafts.championshipId, championships.id)
    )
    .where(eq(championshipDrafts.uuid, draftUuid));

  if (!row) {
    return false;
  }

  return catchUpChampionshipDraft(row.championshipUuid, now, "job");
}

export async function advanceChampionshipDraftJob(
  payload: JsonValue | null
): Promise<JsonValue> {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    typeof payload.draftUuid !== "string"
  ) {
    throw badRequest("Draft advancement job requires a draft UUID");
  }

  return {
    draftUuid: payload.draftUuid,
    advanced: await catchUpChampionshipDraftByUuid(payload.draftUuid)
  };
}

async function projectChampionshipDraft(
  database: DatabaseExecutor,
  championship: Championship,
  query: ChampionshipDraftQuery
): Promise<ChampionshipDraftResponse> {
  const [draft] = await database
    .select()
    .from(championshipDrafts)
    .where(eq(championshipDrafts.championshipId, championship.id));

  if (!draft) {
    return { draft: null };
  }

  const orderRows = await database
    .select({
      order: championshipDraftOrder,
      team: championshipTeams
    })
    .from(championshipDraftOrder)
    .innerJoin(
      championshipTeams,
      eq(championshipDraftOrder.teamId, championshipTeams.id)
    )
    .where(eq(championshipDraftOrder.draftId, draft.id))
    .orderBy(asc(championshipDraftOrder.position));
  const teamIds = orderRows.map(({ team }) => team.id);
  const membershipRows =
    teamIds.length === 0
      ? []
      : await database
          .select({
            membership: championshipTeamMemberships,
            participant: championshipParticipants
          })
          .from(championshipTeamMemberships)
          .innerJoin(
            championshipParticipants,
            eq(
              championshipTeamMemberships.participantId,
              championshipParticipants.id
            )
          )
          .where(
            and(
              inArray(championshipTeamMemberships.teamId, teamIds),
              isNull(championshipTeamMemberships.endedAt)
            )
          )
          .orderBy(
            asc(championshipTeamMemberships.teamId),
            asc(championshipTeamMemberships.role),
            asc(championshipTeamMemberships.id)
          );
  const turnCursor = decodeCursor<number>(query.turnCursor);
  const turnLimit = boundedLimit(query.turnLimit, defaultTurnLimit, 100);
  const turnRows = await database
    .select({
      turn: championshipDraftTurns,
      team: championshipTeams,
      participant: championshipParticipants
    })
    .from(championshipDraftTurns)
    .innerJoin(
      championshipTeams,
      eq(championshipDraftTurns.teamId, championshipTeams.id)
    )
    .leftJoin(
      championshipParticipants,
      eq(
        championshipDraftTurns.selectedParticipantId,
        championshipParticipants.id
      )
    )
    .where(
      and(
        eq(championshipDraftTurns.draftId, draft.id),
        turnCursor === undefined
          ? undefined
          : gt(championshipDraftTurns.sequence, turnCursor)
      )
    )
    .orderBy(asc(championshipDraftTurns.sequence))
    .limit(turnLimit + 1);
  const visibleTurns = turnRows.slice(0, turnLimit);
  const participantCursor = decodeCursor<number>(query.participantCursor);
  const participantLimit = boundedLimit(
    query.participantLimit,
    defaultParticipantLimit,
    100
  );
  const participantRows = await database
    .select({
      participant: championshipParticipants,
      price: championshipParticipantPrices
    })
    .from(championshipParticipants)
    .leftJoin(
      championshipParticipantPrices,
      and(
        eq(
          championshipParticipantPrices.participantId,
          championshipParticipants.id
        ),
        eq(championshipParticipantPrices.championshipId, championship.id)
      )
    )
    .leftJoin(
      championshipTeamMemberships,
      and(
        eq(
          championshipTeamMemberships.participantId,
          championshipParticipants.id
        ),
        isNull(championshipTeamMemberships.endedAt)
      )
    )
    .where(
      and(
        eq(championshipParticipants.championshipId, championship.id),
        eq(championshipParticipants.status, "active"),
        isNull(championshipTeamMemberships.id),
        participantCursor === undefined
          ? undefined
          : gt(championshipParticipants.id, participantCursor)
      )
    )
    .orderBy(asc(championshipParticipants.id))
    .limit(participantLimit + 1);
  const visibleParticipants = participantRows.slice(0, participantLimit);
  const actor = query.actorAccountUuid
    ? await resolveDraftActorControl(
        database,
        championship,
        draft,
        await findChampionshipActor(database, query.actorAccountUuid)
      )
    : {
        canManage: false,
        gmTeamIds: [],
        eligibleTurnIds: []
      };

  return {
    draft: {
      uuid: draft.uuid,
      state: draft.state,
      rounds: draft.rounds,
      countdownSeconds: draft.countdownSeconds,
      nextTurnSequence: draft.nextTurnSequence,
      revision: draft.revision,
      championshipRevision: championship.revision,
      serverTime: new Date().toISOString(),
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
      canceledAt: draft.canceledAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      teams: orderRows.map(({ order, team }) => {
        const roster = membershipRows.filter(
          ({ membership }) => membership.teamId === team.id
        );
        const usageUnits = roster.reduce(
          (sum, { membership }) => sum + (membership.priceUnitsSnapshot ?? 0),
          0
        );

        return {
          uuid: team.uuid,
          name: team.name,
          abbreviation: team.abbreviation,
          colors: team.colors,
          position: order.position,
          rosterRevision: team.rosterRevision,
          rosterSize: roster.length,
          usageUnits,
          remainingUnits: championship.rules.salary.enabled
            ? championship.rules.salary.capUnits - usageUnits
            : 0,
          overCap:
            championship.rules.salary.enabled &&
            usageUnits > championship.rules.salary.capUnits,
          roster: roster.map(({ membership, participant }) => ({
            participantUuid: participant.uuid,
            displayName: participant.displayNameSnapshot,
            role: membership.role,
            priceUnits: membership.priceUnitsSnapshot
          }))
        };
      }),
      turns: {
        items: visibleTurns.map(({ turn, team, participant }) => ({
          uuid: turn.uuid,
          sequence: turn.sequence,
          round: turn.round,
          position: turn.position,
          team: {
            uuid: team.uuid,
            name: team.name
          },
          state: turn.state,
          selectedParticipant: participant
            ? {
                uuid: participant.uuid,
                displayName: participant.displayNameSnapshot
              }
            : null,
          priceUnitsSnapshot: turn.priceUnitsSnapshot,
          openedAt: turn.openedAt,
          deadlineAt: turn.deadlineAt,
          overdueAt: turn.overdueAt,
          filledAt: turn.filledAt,
          revision: turn.revision
        })),
        page: {
          limit: turnLimit,
          nextCursor:
            turnRows.length > turnLimit
              ? encodeCursor(visibleTurns.at(-1)!.turn.sequence)
              : null
        }
      },
      availableParticipants: {
        items: visibleParticipants.map(({ participant, price }) => ({
          uuid: participant.uuid,
          displayName: participant.displayNameSnapshot,
          priceUnits: championship.rules.salary.enabled
            ? (price?.priceUnits ?? null)
            : null
        })),
        page: {
          limit: participantLimit,
          nextCursor:
            participantRows.length > participantLimit
              ? encodeCursor(visibleParticipants.at(-1)!.participant.id)
              : null
        }
      },
      actor
    }
  };
}

async function resolveDraftActorControl(
  database: DatabaseExecutor,
  championship: Championship,
  draft: ChampionshipDraft,
  actor: ChampionshipActor
): Promise<{
  canManage: boolean;
  gmTeamIds: string[];
  eligibleTurnIds: string[];
}> {
  const canManage = await championshipActorHasPermission(database, actor, {
    permission: ["championship:admin", "championship:operate"],
    championshipId: championship.id
  });
  const gmRows = await database
    .select({ teamUuid: championshipTeams.uuid })
    .from(championshipParticipants)
    .innerJoin(
      championshipTeamMemberships,
      and(
        eq(
          championshipTeamMemberships.participantId,
          championshipParticipants.id
        ),
        eq(championshipTeamMemberships.role, "gm"),
        isNull(championshipTeamMemberships.endedAt)
      )
    )
    .innerJoin(
      championshipTeams,
      eq(championshipTeamMemberships.teamId, championshipTeams.id)
    )
    .where(
      and(
        eq(championshipParticipants.championshipId, championship.id),
        eq(championshipParticipants.accountId, actor.account.id)
      )
    );
  const gmTeamIds = gmRows.map(({ teamUuid }) => teamUuid);
  const eligibleRows = await database
    .select({
      turnUuid: championshipDraftTurns.uuid,
      teamUuid: championshipTeams.uuid
    })
    .from(championshipDraftTurns)
    .innerJoin(
      championshipTeams,
      eq(championshipDraftTurns.teamId, championshipTeams.id)
    )
    .where(
      and(
        eq(championshipDraftTurns.draftId, draft.id),
        inArray(championshipDraftTurns.state, ["open", "overdue"]),
        canManage
          ? undefined
          : gmTeamIds.length > 0
            ? inArray(championshipTeams.uuid, gmTeamIds)
            : sql`0 = 1`
      )
    )
    .orderBy(asc(championshipDraftTurns.sequence));

  return {
    canManage,
    gmTeamIds,
    eligibleTurnIds: eligibleRows.map(({ turnUuid }) => turnUuid)
  };
}

async function buildDraftCorrectionPreview(
  database: DatabaseExecutor,
  championship: Championship,
  turnUuid: string
): Promise<ChampionshipDraftCorrectionPreviewResponse> {
  const [row] = await database
    .select({
      draft: championshipDrafts,
      turn: championshipDraftTurns,
      team: championshipTeams,
      participant: championshipParticipants
    })
    .from(championshipDraftTurns)
    .innerJoin(
      championshipDrafts,
      eq(championshipDraftTurns.draftId, championshipDrafts.id)
    )
    .innerJoin(
      championshipTeams,
      eq(championshipDraftTurns.teamId, championshipTeams.id)
    )
    .leftJoin(
      championshipParticipants,
      eq(
        championshipDraftTurns.selectedParticipantId,
        championshipParticipants.id
      )
    )
    .where(
      and(
        eq(championshipDrafts.championshipId, championship.id),
        eq(championshipDraftTurns.uuid, turnUuid)
      )
    );

  if (!row) {
    throw notFound("Championship draft turn not found");
  }

  const [activeMembership] = row.participant
    ? await database
        .select()
        .from(championshipTeamMemberships)
        .where(
          and(
            eq(championshipTeamMemberships.participantId, row.participant.id),
            isNull(championshipTeamMemberships.endedAt)
          )
        )
    : [null];
  const reasons: string[] = [];

  if (row.turn.state !== "filled" || !row.participant) {
    reasons.push("O turno não possui uma escolha ativa.");
  }

  if (
    row.participant &&
    (!activeMembership ||
      activeMembership.teamId !== row.team.id ||
      activeMembership.acquisitionSource !== "draft" ||
      activeMembership.acquisitionReferenceUuid !== row.turn.uuid)
  ) {
    reasons.push(
      "O participante já foi movimentado depois da escolha; reverta a movimentação dependente primeiro."
    );
  }

  const rosterRows = await database
    .select({
      priceUnits: championshipTeamMemberships.priceUnitsSnapshot
    })
    .from(championshipTeamMemberships)
    .where(
      and(
        eq(championshipTeamMemberships.teamId, row.team.id),
        isNull(championshipTeamMemberships.endedAt)
      )
    );
  const currentUsage = rosterRows.reduce(
    (sum, { priceUnits }) => sum + (priceUnits ?? 0),
    0
  );
  const usageAfterUnits =
    currentUsage - (activeMembership?.priceUnitsSnapshot ?? 0);

  return {
    turnUuid: row.turn.uuid,
    canReverse: reasons.length === 0,
    reasons,
    participant: row.participant
      ? {
          uuid: row.participant.uuid,
          displayName: row.participant.displayNameSnapshot,
          priceUnits: row.turn.priceUnitsSnapshot
        }
      : null,
    team: {
      uuid: row.team.uuid,
      name: row.team.name,
      rosterRevision: row.team.rosterRevision,
      usageAfterUnits,
      remainingAfterUnits: championship.rules.salary.enabled
        ? championship.rules.salary.capUnits - usageAfterUnits
        : 0
    },
    reopenedState: reopenedDraftTurnState(
      row.turn.sequence,
      row.draft.nextTurnSequence
    )
  };
}

async function resolveOrderedTeams(
  database: DatabaseExecutor,
  championshipId: number,
  teamUuids: string[]
) {
  const rows = await database
    .select()
    .from(championshipTeams)
    .where(
      and(
        eq(championshipTeams.championshipId, championshipId),
        inArray(championshipTeams.uuid, teamUuids),
        eq(championshipTeams.state, "active")
      )
    );
  const byUuid = new Map(rows.map((team) => [team.uuid, team]));
  const missing = teamUuids.filter((uuid) => !byUuid.has(uuid));

  if (missing.length > 0) {
    throw badRequest("Draft order contains missing or inactive teams");
  }

  return teamUuids.map((uuid) => byUuid.get(uuid)!);
}

async function requireDraft(
  database: DatabaseExecutor,
  championshipId: number
): Promise<ChampionshipDraft> {
  const [draft] = await database
    .select()
    .from(championshipDrafts)
    .where(eq(championshipDrafts.championshipId, championshipId));

  if (!draft) {
    throw notFound("Championship draft not found");
  }

  return draft;
}

function requireDraftRevision(
  draft: ChampionshipDraft,
  expectedRevision: number
): void {
  if (draft.revision !== expectedRevision) {
    throw conflict("Draft revision does not match", {
      draftUuid: draft.uuid,
      expectedRevision,
      currentRevision: draft.revision,
      state: draft.state
    });
  }
}

async function participantInternalId(
  database: DatabaseExecutor,
  championshipId: number,
  participantUuid: string
): Promise<number> {
  const [participant] = await database
    .select({ id: championshipParticipants.id })
    .from(championshipParticipants)
    .where(
      and(
        eq(championshipParticipants.championshipId, championshipId),
        eq(championshipParticipants.uuid, participantUuid)
      )
    );

  if (!participant) {
    throw notFound("Championship participant not found");
  }

  return participant.id;
}

async function maximumDraftTurnSequence(
  database: DatabaseExecutor,
  draftId: number
): Promise<number> {
  const [result] = await database
    .select({
      maximum: sql<number>`coalesce(max(${championshipDraftTurns.sequence}), 0)`
    })
    .from(championshipDraftTurns)
    .where(eq(championshipDraftTurns.draftId, draftId));

  return Number(result?.maximum ?? 0);
}

async function scheduleDraftAdvance(
  tx: DbTransaction,
  draftUuid: string,
  deadlineAt: string | null
): Promise<void> {
  if (!deadlineAt) {
    return;
  }

  const now = new Date().toISOString();
  await tx.insert(jobs).values({
    uuid: crypto.randomUUID(),
    type: draftAdvanceJobType,
    status: "queued",
    payload: { draftUuid },
    attempts: 0,
    maxAttempts: 3,
    runAfter: deadlineAt,
    createdAt: now,
    updatedAt: now
  });
}

function projectionQuery(actorAccountUuid: string): ChampionshipDraftQuery {
  return {
    actorAccountUuid,
    turnLimit: 100,
    participantLimit: 100
  };
}

function boundedLimit(
  value: number | undefined,
  fallback: number,
  maximum: number
): number {
  return Math.min(Math.max(value ?? fallback, 1), maximum);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export { draftAdvanceJobType };
