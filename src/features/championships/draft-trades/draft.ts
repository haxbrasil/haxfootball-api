import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  type DatabaseExecutor,
  type DbTransaction,
  withDatabaseTransaction
} from "@/db/client";
import type {
  ChampionshipDraftQuery,
  CancelChampionshipDraftInput,
  ConfigureChampionshipDraftInput,
  EndChampionshipDraftInput,
  MakeChampionshipDraftPickInput,
  PreviewChampionshipRecordedDraftInput,
  RecordChampionshipDraftInput,
  StartChampionshipDraftInput,
  VoidChampionshipDraftPickInput
} from "@/features/championships/_shared/http/inputs";
import type {
  ChampionshipDraftCorrectionPreviewResponse,
  ChampionshipDraftResponse,
  ChampionshipRecordedDraftPreviewResponse
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
import {
  championshipCapExceptions,
  championshipParticipantPrices,
  championshipSalaryLedgerEntries
} from "@/features/championships/finance/db";
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

      if (
        existingDraft &&
        existingDraft.state !== "setup" &&
        existingDraft.state !== "canceled"
      ) {
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
            state: "setup",
            rounds: input.rounds,
            countdownSeconds: input.countdownSeconds,
            nextTurnSequence: 1,
            revision: existingDraft.revision + 1,
            startedAt: null,
            completedAt: null,
            canceledAt: null,
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

export async function previewChampionshipRecordedDraft(
  championshipUuid: string,
  input: PreviewChampionshipRecordedDraftInput
): Promise<ChampionshipRecordedDraftPreviewResponse> {
  const [championship] = await db
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  await requireChampionshipActor(db, {
    actorAccountUuid: input.actorAccountUuid,
    permission: "championship:admin",
    championshipId: championship.id
  });

  return buildRecordedDraftPreview(db, championship, input);
}

export async function recordChampionshipDraft(
  championshipUuid: string,
  input: RecordChampionshipDraftInput
): Promise<ChampionshipDraftResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "draft.recorded"
    },
    async (tx, championship, actor) => {
      if (["canceled", "archived"].includes(championship.lifecycle)) {
        throw conflict("This championship cannot receive a recorded draft");
      }

      const preview = await buildRecordedDraftPreview(tx, championship, input);

      if (preview.previewHash !== input.previewHash) {
        throw conflict("Recorded draft preview is out of date", {
          expectedPreviewHash: input.previewHash,
          currentPreviewHash: preview.previewHash
        });
      }

      const errors = preview.issues.filter(
        ({ severity }) => severity === "error"
      );
      if (errors.length > 0) {
        throw conflict("Recorded draft has validation errors", { preview });
      }

      if (preview.requiresCapException && !input.confirmCapException) {
        throw conflict("Recorded draft requires an approved cap exception", {
          preview
        });
      }

      if (preview.requiresCapException && !input.reason?.trim()) {
        throw badRequest("A reason is required for a staff cap exception");
      }

      const [existingDraft] = await tx
        .select()
        .from(championshipDrafts)
        .where(eq(championshipDrafts.championshipId, championship.id));

      if (
        existingDraft &&
        existingDraft.state !== "setup" &&
        existingDraft.state !== "canceled"
      ) {
        throw conflict(
          "Only a setup draft can be replaced by a recorded draft",
          {
            draftState: existingDraft.state
          }
        );
      }

      const teams = await resolveOrderedTeams(
        tx,
        championship.id,
        input.teamIds
      );
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
            mode: "recorded",
            state: "completed",
            rounds: input.rounds,
            countdownSeconds: 0,
            nextTurnSequence:
              Math.max(...input.slots.map(({ sequence }) => sequence), 0) + 1,
            revision: existingDraft.revision + 1,
            startedAt: null,
            completedAt: now,
            canceledAt: null,
            occurredAt: input.occurredAt ?? null,
            recordedAt: now,
            recordedByAccountId: actor.account.id,
            recordedNote: input.recordedNote ?? null,
            updatedAt: now
          })
          .where(eq(championshipDrafts.id, existingDraft.id))
          .returning();
      } else {
        [draft] = await tx
          .insert(championshipDrafts)
          .values({
            championshipId: championship.id,
            mode: "recorded",
            state: "completed",
            rounds: input.rounds,
            countdownSeconds: 0,
            nextTurnSequence:
              Math.max(...input.slots.map(({ sequence }) => sequence), 0) + 1,
            completedAt: now,
            occurredAt: input.occurredAt ?? null,
            recordedAt: now,
            recordedByAccountId: actor.account.id,
            recordedNote: input.recordedNote ?? null,
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

      const turns = await insertRecordedDraftTurns(
        tx,
        draft.id,
        input.slots,
        now
      );
      const turnBySequence = new Map(
        turns.map((turn) => [turn.sequence, turn])
      );

      for (const slot of input.slots) {
        if (slot.resolution !== "selected" || !slot.participantId) {
          continue;
        }

        const turn = turnBySequence.get(slot.sequence);
        if (!turn) {
          throw conflict("Recorded draft turn could not be materialized", {
            sequence: slot.sequence
          });
        }

        const applied = await applyRecordedDraftPick(tx, championship, {
          participantId: slot.participantId,
          targetTeamId: slot.teamId,
          acquisitionReferenceUuid: turn.uuid,
          actorAccountId: actor.account.id,
          allowCapException: input.confirmCapException,
          reason: input.reason
        });
        await tx
          .update(championshipDraftTurns)
          .set({
            state: "filled",
            selectedParticipantId: await participantInternalId(
              tx,
              championship.id,
              slot.participantId
            ),
            priceUnitsSnapshot: applied.priceUnitsSnapshot,
            filledAt: now,
            selectedByAccountId: actor.account.id,
            recordedResolution: "selected",
            occurredAt: slot.occurredAt ?? input.occurredAt ?? null,
            recordedNote: slot.recordedNote ?? null,
            revision: 1,
            updatedAt: now
          })
          .where(eq(championshipDraftTurns.id, turn.id));
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
          ? { state: existingDraft.state, mode: existingDraft.mode }
          : null,
        after: {
          state: draft.state,
          mode: draft.mode,
          selectedCount: preview.selectedCount,
          unresolvedCount: preview.unresolvedCount,
          skippedCount: preview.skippedCount,
          occurredAt: input.occurredAt ?? null
        },
        reason: input.reason ?? input.recordedNote ?? null,
        metadata: {
          previewHash: input.previewHash,
          teamCount: teams.length,
          turnCount: input.slots.length
        },
        outboxTopic: "championship.draft.recorded"
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

export async function cancelChampionshipDraft(
  championshipUuid: string,
  input: CancelChampionshipDraftInput
): Promise<ChampionshipDraftResponse> {
  await catchUpChampionshipDraft(championshipUuid, new Date(), "request");

  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "draft.canceled"
    },
    async (tx, championship) => {
      const draft = await requireDraft(tx, championship.id);
      requireDraftRevision(draft, input.expectedDraftRevision);

      if (draft.state !== "setup" && draft.state !== "live") {
        throw conflict("Only a setup or live draft can be canceled", {
          draftState: draft.state
        });
      }

      const filledTurns = await tx
        .select({ uuid: championshipDraftTurns.uuid })
        .from(championshipDraftTurns)
        .where(
          and(
            eq(championshipDraftTurns.draftId, draft.id),
            eq(championshipDraftTurns.state, "filled")
          )
        )
        .limit(101);

      if (filledTurns.length > 0) {
        throw conflict("Draft picks must be reversed before cancellation", {
          filledPickCount: filledTurns.length,
          filledTurnUuids: filledTurns.slice(0, 100).map(({ uuid }) => uuid),
          truncated: filledTurns.length > 100
        });
      }

      const now = new Date().toISOString();
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
          state: "canceled",
          nextTurnSequence: (await maximumDraftTurnSequence(tx, draft.id)) + 1,
          revision: draft.revision + 1,
          completedAt: null,
          canceledAt: now,
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
          revision: updatedDraft.revision
        },
        reason: input.reason,
        outboxTopic: "championship.draft.canceled"
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

type RecordedDraftDefinition = Pick<
  RecordChampionshipDraftInput,
  "teamIds" | "rounds" | "occurredAt" | "recordedNote" | "slots"
>;

type RecordedDraftIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  sequence: number | null;
  participantUuid: string | null;
};

async function buildRecordedDraftPreview(
  database: DatabaseExecutor,
  championship: Championship,
  input: RecordedDraftDefinition
): Promise<ChampionshipRecordedDraftPreviewResponse> {
  const definition = canonicalRecordedDraftDefinition(input);
  const issues: RecordedDraftIssue[] = [];
  const addIssue = (
    issue: Omit<RecordedDraftIssue, "sequence" | "participantUuid"> & {
      sequence?: number | null;
      participantUuid?: string | null;
    }
  ) => {
    issues.push({
      ...issue,
      sequence: issue.sequence ?? null,
      participantUuid: issue.participantUuid ?? null
    });
  };

  if (["canceled", "archived"].includes(championship.lifecycle)) {
    addIssue({
      code: "championship-state",
      severity: "error",
      message: "A edicao precisa estar disponivel para registrar o draft."
    });
  }

  const [existingDraft] = await database
    .select()
    .from(championshipDrafts)
    .where(eq(championshipDrafts.championshipId, championship.id));

  if (
    existingDraft &&
    existingDraft.state !== "setup" &&
    existingDraft.state !== "canceled"
  ) {
    addIssue({
      code: "existing-draft",
      severity: "error",
      message: "O draft atual precisa ser corrigido antes de registrar outro."
    });
  }

  const teams = await resolveOrderedTeams(
    database,
    championship.id,
    definition.teamIds
  );
  const teamByUuid = new Map(teams.map((team) => [team.uuid, team]));
  const teamIdSet = new Set(definition.teamIds);
  const seenSequences = new Set<number>();
  const seenRoundPositions = new Set<string>();
  const selectedParticipantUuids = definition.slots
    .filter((slot) => slot.resolution === "selected" && slot.participantId)
    .map((slot) => slot.participantId!);
  const selectedParticipantSet = new Set<string>();

  const participantRows = selectedParticipantUuids.length
    ? await database
        .select({
          participant: championshipParticipants,
          price: championshipParticipantPrices,
          membership: championshipTeamMemberships,
          membershipTeam: championshipTeams
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
        .leftJoin(
          championshipTeams,
          eq(championshipTeamMemberships.teamId, championshipTeams.id)
        )
        .where(
          and(
            eq(championshipParticipants.championshipId, championship.id),
            inArray(championshipParticipants.uuid, selectedParticipantUuids)
          )
        )
    : [];
  const participantByUuid = new Map(
    participantRows.map((row) => [row.participant.uuid, row])
  );

  const usageRows =
    teams.length > 0
      ? await database
          .select({
            teamId: championshipTeamMemberships.teamId,
            usageUnits: sql<number>`coalesce(sum(coalesce(${championshipTeamMemberships.priceUnitsSnapshot}, 0)), 0)`
          })
          .from(championshipTeamMemberships)
          .where(
            and(
              inArray(
                championshipTeamMemberships.teamId,
                teams.map((team) => team.id)
              ),
              isNull(championshipTeamMemberships.endedAt)
            )
          )
          .groupBy(championshipTeamMemberships.teamId)
      : [];
  const usageBeforeByTeamId = new Map(
    usageRows.map((row) => [row.teamId, Number(row.usageUnits)])
  );
  const selectedCountByTeamId = new Map<number, number>();
  const usageAfterByTeamId = new Map(
    teams.map((team) => [team.id, usageBeforeByTeamId.get(team.id) ?? 0])
  );

  for (const slot of definition.slots) {
    if (seenSequences.has(slot.sequence)) {
      addIssue({
        code: "duplicate-sequence",
        severity: "error",
        message: "Cada escolha precisa ter uma sequencia propria.",
        sequence: slot.sequence
      });
    }
    seenSequences.add(slot.sequence);

    const roundPositionKey = `${slot.round}:${slot.position}`;
    if (seenRoundPositions.has(roundPositionKey)) {
      addIssue({
        code: "duplicate-position",
        severity: "error",
        message: "Cada posicao de rodada pode aparecer uma vez.",
        sequence: slot.sequence
      });
    }
    seenRoundPositions.add(roundPositionKey);

    if (slot.round > definition.rounds) {
      addIssue({
        code: "round-out-of-range",
        severity: "error",
        message: "A rodada da escolha esta fora da estrutura configurada.",
        sequence: slot.sequence
      });
    }
    if (slot.position > definition.teamIds.length) {
      addIssue({
        code: "position-out-of-range",
        severity: "error",
        message: "A posicao da escolha esta fora da ordem das equipes.",
        sequence: slot.sequence
      });
    }
    if (!teamIdSet.has(slot.teamId)) {
      addIssue({
        code: "team-out-of-range",
        severity: "error",
        message: "A escolha aponta para uma equipe que nao esta no draft.",
        sequence: slot.sequence
      });
    }

    if (slot.resolution === "selected" && !slot.participantId) {
      addIssue({
        code: "selected-without-participant",
        severity: "error",
        message: "Uma escolha registrada precisa de um participante.",
        sequence: slot.sequence
      });
    }
    if (slot.resolution !== "selected" && slot.participantId) {
      addIssue({
        code: "unresolved-with-participant",
        severity: "error",
        message: "Slots sem escolha nao podem conter um participante.",
        sequence: slot.sequence,
        participantUuid: slot.participantId
      });
    }

    if (!slot.participantId || slot.resolution !== "selected") {
      continue;
    }

    if (selectedParticipantSet.has(slot.participantId)) {
      addIssue({
        code: "duplicate-participant",
        severity: "error",
        message: "Cada participante pode ser escolhido uma vez.",
        sequence: slot.sequence,
        participantUuid: slot.participantId
      });
    }
    selectedParticipantSet.add(slot.participantId);

    const participantRow = participantByUuid.get(slot.participantId);
    if (!participantRow) {
      addIssue({
        code: "participant-unavailable",
        severity: "error",
        message: "O participante nao esta disponivel nesta edicao.",
        sequence: slot.sequence,
        participantUuid: slot.participantId
      });
      continue;
    }

    if (participantRow.membership?.role === "gm") {
      addIssue({
        code: "participant-is-gm",
        severity: "error",
        message:
          "General Managers sao definidos no elenco, nao por escolha de jogador.",
        sequence: slot.sequence,
        participantUuid: slot.participantId
      });
    } else if (
      participantRow.membership &&
      participantRow.membershipTeam &&
      participantRow.membershipTeam.uuid !== slot.teamId
    ) {
      addIssue({
        code: "participant-on-other-team",
        severity: "error",
        message: "O participante ja esta em outra equipe.",
        sequence: slot.sequence,
        participantUuid: slot.participantId
      });
    } else if (participantRow.membership) {
      addIssue({
        code: "same-team-membership",
        severity: "warning",
        message: "A atribuicao atual sera registrada como escolha do draft.",
        sequence: slot.sequence,
        participantUuid: slot.participantId
      });
    }

    if (championship.rules.salary.enabled) {
      if (championship.priceState !== "locked") {
        addIssue({
          code: "prices-not-frozen",
          severity: "error",
          message:
            "Os valores precisam estar congelados para registrar o draft.",
          sequence: slot.sequence,
          participantUuid: slot.participantId
        });
      }
      if (!participantRow.price) {
        addIssue({
          code: "price-missing",
          severity: "error",
          message: "O participante precisa ter um valor definido.",
          sequence: slot.sequence,
          participantUuid: slot.participantId
        });
      }
    }

    const targetTeam = teamByUuid.get(slot.teamId);
    if (targetTeam) {
      selectedCountByTeamId.set(
        targetTeam.id,
        (selectedCountByTeamId.get(targetTeam.id) ?? 0) + 1
      );
      if (!participantRow.membership) {
        usageAfterByTeamId.set(
          targetTeam.id,
          (usageAfterByTeamId.get(targetTeam.id) ?? 0) +
            (participantRow.price?.priceUnits ?? 0)
        );
      }
    }
  }

  const maxSequence = Math.max(
    ...definition.slots.map(({ sequence }) => sequence),
    0
  );
  for (let sequence = 1; sequence <= maxSequence; sequence += 1) {
    if (!seenSequences.has(sequence)) {
      addIssue({
        code: "sequence-gap",
        severity: "error",
        message: "A sequencia do draft precisa ser continua.",
        sequence
      });
    }
  }

  let requiresCapException = false;
  const teamPreviews = teams.map((team) => {
    const usageBeforeUnits = usageBeforeByTeamId.get(team.id) ?? 0;
    const usageAfterUnits = usageAfterByTeamId.get(team.id) ?? usageBeforeUnits;
    const overCapAfter =
      championship.rules.salary.enabled &&
      usageAfterUnits > championship.rules.salary.capUnits;
    if (overCapAfter) {
      requiresCapException = true;
      addIssue({
        code: "cap-exception",
        severity: "warning",
        message: "A equipe precisara de uma excecao administrativa de teto.",
        participantUuid: null
      });
    }
    return {
      uuid: team.uuid,
      name: team.name,
      selectedCount: selectedCountByTeamId.get(team.id) ?? 0,
      usageBeforeUnits,
      usageAfterUnits,
      remainingAfterUnits: championship.rules.salary.capUnits - usageAfterUnits,
      overCapAfter
    };
  });

  return {
    valid: issues.every(({ severity }) => severity !== "error"),
    previewHash: hashRecordedDraftDefinition(definition),
    currentChampionshipRevision: championship.revision,
    rounds: definition.rounds,
    requiresCapException,
    selectedCount: definition.slots.filter(
      ({ resolution }) => resolution === "selected"
    ).length,
    unresolvedCount: definition.slots.filter(
      ({ resolution }) => resolution === "unresolved"
    ).length,
    skippedCount: definition.slots.filter(
      ({ resolution }) => resolution === "skipped"
    ).length,
    issues,
    slots: definition.slots.map((slot) => {
      const participantRow = slot.participantId
        ? participantByUuid.get(slot.participantId)
        : undefined;
      const team = teamByUuid.get(slot.teamId);
      return {
        sequence: slot.sequence,
        round: slot.round,
        position: slot.position,
        team: {
          uuid: slot.teamId,
          name: team?.name ?? "Equipe nao encontrada"
        },
        resolution: slot.resolution,
        participant: participantRow
          ? {
              uuid: participantRow.participant.uuid,
              displayName: participantRow.participant.displayNameSnapshot
            }
          : null,
        priceUnitsSnapshot: championship.rules.salary.enabled
          ? (participantRow?.price?.priceUnits ?? null)
          : null,
        existingTeam: participantRow?.membershipTeam
          ? {
              uuid: participantRow.membershipTeam.uuid,
              name: participantRow.membershipTeam.name
            }
          : null
      };
    }),
    teams: teamPreviews
  };
}

async function insertRecordedDraftTurns(
  database: DbTransaction,
  draftId: number,
  slots: RecordChampionshipDraftInput["slots"],
  now: string
) {
  const teamRows = await database
    .select({ id: championshipTeams.id, uuid: championshipTeams.uuid })
    .from(championshipTeams)
    .where(
      inArray(
        championshipTeams.uuid,
        slots.map(({ teamId }) => teamId)
      )
    );
  const teamIdByUuid = new Map(teamRows.map((team) => [team.uuid, team.id]));
  const values = slots.map((slot) => {
    const teamId = teamIdByUuid.get(slot.teamId);
    if (!teamId) {
      throw conflict("Recorded draft turn references an unknown team", {
        teamId: slot.teamId,
        sequence: slot.sequence
      });
    }

    return {
      draftId,
      sequence: slot.sequence,
      round: slot.round,
      position: slot.position,
      teamId,
      state:
        slot.resolution === "selected"
          ? ("pending" as const)
          : ("voided" as const),
      recordedResolution: slot.resolution,
      occurredAt: slot.occurredAt ?? null,
      recordedNote: slot.recordedNote ?? null,
      createdAt: now,
      updatedAt: now
    };
  });
  const result: Array<typeof championshipDraftTurns.$inferSelect> = [];

  for (const batch of chunks(values, 100)) {
    result.push(
      ...(await database
        .insert(championshipDraftTurns)
        .values(batch)
        .returning())
    );
  }

  return result;
}

async function applyRecordedDraftPick(
  database: DbTransaction,
  championship: Championship,
  input: {
    participantId: string;
    targetTeamId: string;
    acquisitionReferenceUuid: string;
    actorAccountId: number;
    allowCapException?: boolean;
    reason?: string | null;
  }
): Promise<{ priceUnitsSnapshot: number | null; adopted: boolean }> {
  const participantId = await participantInternalId(
    database,
    championship.id,
    input.participantId
  );
  const [current] = await database
    .select({
      membership: championshipTeamMemberships,
      team: championshipTeams
    })
    .from(championshipTeamMemberships)
    .innerJoin(
      championshipTeams,
      eq(championshipTeamMemberships.teamId, championshipTeams.id)
    )
    .where(
      and(
        eq(championshipTeamMemberships.participantId, participantId),
        isNull(championshipTeamMemberships.endedAt)
      )
    );

  if (!current || current.team.uuid !== input.targetTeamId) {
    const applied = await applyChampionshipRosterMove(database, championship, {
      participantId: input.participantId,
      targetTeamId: input.targetTeamId,
      role: "player",
      acquisitionSource: "draft",
      acquisitionReferenceUuid: input.acquisitionReferenceUuid,
      actorAccountId: input.actorAccountId,
      allowCapException: input.allowCapException,
      reason: input.reason
    });
    return {
      priceUnitsSnapshot: applied.membership.priceUnitsSnapshot,
      adopted: false
    };
  }

  if (current.membership.role !== "player") {
    throw conflict(
      "A General Manager cannot also be recorded as a draft pick",
      {
        participantId: input.participantId
      }
    );
  }

  const [price] = await database
    .select()
    .from(championshipParticipantPrices)
    .where(
      and(
        eq(championshipParticipantPrices.championshipId, championship.id),
        eq(championshipParticipantPrices.participantId, participantId)
      )
    );
  const priceUnitsSnapshot = championship.rules.salary.enabled
    ? (price?.priceUnits ?? null)
    : null;
  const now = new Date().toISOString();
  const nextRosterRevision = current.team.rosterRevision + 1;

  await database
    .update(championshipCapExceptions)
    .set({ state: "expired", expiredAt: now })
    .where(
      and(
        eq(championshipCapExceptions.teamId, current.team.id),
        eq(championshipCapExceptions.state, "active")
      )
    );
  await database
    .update(championshipTeamMemberships)
    .set({ effectiveToRevision: nextRosterRevision, endedAt: now })
    .where(eq(championshipTeamMemberships.id, current.membership.id));
  await database.insert(championshipSalaryLedgerEntries).values({
    championshipId: championship.id,
    teamId: current.team.id,
    participantId,
    membershipUuid: current.membership.uuid,
    amountUnits: -(current.membership.priceUnitsSnapshot ?? 0),
    kind: "membership-ended",
    rosterRevision: nextRosterRevision,
    actorAccountId: input.actorAccountId,
    reason: input.reason ?? null
  });
  const [membership] = await database
    .insert(championshipTeamMemberships)
    .values({
      championshipId: championship.id,
      teamId: current.team.id,
      participantId,
      role: "player",
      acquisitionSource: "draft",
      acquisitionReferenceUuid: input.acquisitionReferenceUuid,
      priceUnitsSnapshot,
      displayOrder: current.membership.displayOrder,
      effectiveFromRevision: nextRosterRevision,
      startedAt: now,
      createdAt: now
    })
    .returning();
  await database.insert(championshipSalaryLedgerEntries).values({
    championshipId: championship.id,
    teamId: current.team.id,
    participantId,
    membershipUuid: membership.uuid,
    amountUnits: priceUnitsSnapshot ?? 0,
    kind: "membership-added",
    rosterRevision: nextRosterRevision,
    actorAccountId: input.actorAccountId,
    reason: input.reason ?? null
  });
  await database
    .update(championshipTeams)
    .set({
      rosterRevision: nextRosterRevision,
      revision: current.team.revision + 1,
      updatedAt: now
    })
    .where(eq(championshipTeams.id, current.team.id));

  return { priceUnitsSnapshot, adopted: true };
}

function canonicalRecordedDraftDefinition(
  input: RecordedDraftDefinition
): RecordedDraftDefinition {
  return {
    teamIds: [...input.teamIds],
    rounds: input.rounds,
    occurredAt: input.occurredAt,
    recordedNote: input.recordedNote,
    slots: [...input.slots].sort(
      (left, right) => left.sequence - right.sequence
    )
  };
}

function hashRecordedDraftDefinition(input: RecordedDraftDefinition): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalRecordedDraftDefinition(input)))
    .digest("hex");
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

  if (!draft || draft.state === "canceled") {
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
      mode: draft.mode,
      rounds: draft.rounds,
      countdownSeconds: draft.countdownSeconds,
      nextTurnSequence: draft.nextTurnSequence,
      revision: draft.revision,
      championshipRevision: championship.revision,
      serverTime: new Date().toISOString(),
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
      canceledAt: draft.canceledAt,
      occurredAt: draft.occurredAt,
      recordedAt: draft.recordedAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      teams: orderRows.map(({ order, team }) => {
        const roster = membershipRows
          .filter(({ membership }) => membership.teamId === team.id)
          .sort(
            (left, right) =>
              left.membership.displayOrder - right.membership.displayOrder
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
          recordedResolution: turn.recordedResolution,
          occurredAt: turn.occurredAt,
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
