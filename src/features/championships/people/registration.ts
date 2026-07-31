import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbTransaction } from "@/db/client";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import { championships } from "@/features/championships/core/db";
import { championshipParticipantPrices } from "@/features/championships/finance/db";
import {
  championshipParticipants,
  championshipTeamMemberships
} from "@/features/championships/people/db";
import { getChampionshipDetailFrom } from "@/features/championships/_shared/db/queries";
import { getChampionshipParticipantFrom } from "@/features/championships/people/projections";
import type {
  CreateChampionshipParticipantInput,
  SelfRegisterChampionshipInput,
  TransitionChampionshipRegistrationInput,
  UpdateChampionshipParticipantInput,
  WithdrawChampionshipRegistrationInput
} from "@/features/championships/_shared/http/inputs";
import type {
  ChampionshipDetailResponse,
  ChampionshipParticipantResponse
} from "@/features/championships/_shared/http/responses";
import { badRequest, conflict, notFound } from "@/shared/http/errors";

const mutableChampionshipLifecycles = ["setup", "active"] as const;

export async function transitionChampionshipRegistration(
  championshipUuid: string,
  input: TransitionChampionshipRegistrationInput
): Promise<ChampionshipDetailResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: `registration.${input.operation}ed`
    },
    async (tx, championship) => {
      assertRegistrationLifecycle(championship.lifecycle);
      const nextState = input.operation === "open" ? "open" : "closed";

      if (championship.registrationState === nextState) {
        throw badRequest(`Championship registration is already ${nextState}`);
      }

      if (
        input.operation === "close" &&
        championship.registrationState !== "open"
      ) {
        throw badRequest("Championship registration is not open");
      }

      const now = new Date().toISOString();
      await tx
        .update(championships)
        .set({ registrationState: nextState })
        .where(eq(championships.id, championship.id));

      if (input.operation === "close") {
        await tx
          .update(championshipParticipants)
          .set({
            registrationClosedAt: now,
            updatedAt: now
          })
          .where(
            and(
              eq(championshipParticipants.championshipId, championship.id),
              inArray(championshipParticipants.status, ["pending", "active"])
            )
          );
      }

      const detail = await getChampionshipDetailFrom(tx, championship.uuid);

      return {
        response: () => detail,
        targetType: "registration",
        targetUuid: championship.uuid,
        before: { state: championship.registrationState },
        after: { state: nextState },
        reason: input.reason ?? null,
        outboxTopic: `championship.registration.${input.operation}ed`
      };
    }
  );
}

export async function selfRegisterChampionship(
  championshipUuid: string,
  input: SelfRegisterChampionshipInput
): Promise<ChampionshipParticipantResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      authorize: async (_tx, championship) => {
        assertRegistrationLifecycle(championship.lifecycle);

        if (championship.historical) {
          throw badRequest(
            "Historical championships do not accept self-registration"
          );
        }

        if (championship.registrationState !== "open") {
          throw conflict("Championship registration is not open", {
            registrationState: championship.registrationState
          });
        }
      },
      action: "participant.self-registered"
    },
    async (tx, championship, actor) => {
      await assertAccountNotRegistered(tx, championship.id, actor.account.id);
      const now = new Date().toISOString();
      const [participant] = await tx
        .insert(championshipParticipants)
        .values({
          championshipId: championship.id,
          accountId: actor.account.id,
          displayNameSnapshot: actor.account.name,
          status: "active",
          origin: "self",
          registeredAt: now,
          revision: 1
        })
        .returning();
      const response = await getChampionshipParticipantFrom(
        tx,
        championship.id,
        participant.uuid
      );

      return {
        response: () => response,
        targetType: "participant",
        targetUuid: participant.uuid,
        before: null,
        after: response,
        outboxTopic: "championship.participant.registered"
      };
    }
  );
}

export async function getSelfChampionshipRegistration(
  championshipUuid: string,
  actorAccountUuid: string
): Promise<ChampionshipParticipantResponse | null> {
  const [row] = await db
    .select({
      championshipId: championships.id,
      participantUuid: championshipParticipants.uuid
    })
    .from(championships)
    .innerJoin(accounts, eq(accounts.uuid, actorAccountUuid))
    .leftJoin(
      championshipParticipants,
      and(
        eq(championshipParticipants.championshipId, championships.id),
        eq(championshipParticipants.accountId, accounts.id)
      )
    )
    .where(eq(championships.uuid, championshipUuid));

  if (!row) {
    throw notFound("Championship or account not found");
  }

  return row.participantUuid
    ? getChampionshipParticipantFrom(
        db,
        row.championshipId,
        row.participantUuid
      )
    : null;
}

export async function createChampionshipParticipant(
  championshipUuid: string,
  input: CreateChampionshipParticipantInput
): Promise<ChampionshipParticipantResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "participant.staff-registered"
    },
    async (tx, championship, actor) => {
      assertRegistrationLifecycle(championship.lifecycle);
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.uuid, input.accountUuid));

      if (!account) {
        throw notFound("Participant account not found");
      }

      assertLateParticipantPrice(championship, input.priceUnits);
      await assertAccountNotRegistered(tx, championship.id, account.id);
      const now = new Date().toISOString();
      const [participant] = await tx
        .insert(championshipParticipants)
        .values({
          championshipId: championship.id,
          accountId: account.id,
          displayNameSnapshot: account.name,
          status: input.status ?? "active",
          origin: "staff",
          registeredAt: now,
          registrationClosedAt:
            championship.registrationState === "closed" ? now : null,
          revision: 1
        })
        .returning();
      await createParticipantPriceIfProvided(tx, {
        championshipId: championship.id,
        participantId: participant.id,
        priceUnits: input.priceUnits,
        frozen: championship.priceState === "locked",
        actorAccountId: actor.account.id,
        now
      });
      const response = await getChampionshipParticipantFrom(
        tx,
        championship.id,
        participant.uuid
      );

      return {
        response: () => response,
        targetType: "participant",
        targetUuid: participant.uuid,
        before: null,
        after: response,
        reason: input.reason ?? null,
        outboxTopic: "championship.participant.registered"
      };
    }
  );
}

export async function withdrawChampionshipRegistration(
  championshipUuid: string,
  input: WithdrawChampionshipRegistrationInput
): Promise<ChampionshipParticipantResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      authorize: async (_tx, championship) => {
        assertRegistrationLifecycle(championship.lifecycle);
      },
      action: "participant.self-withdrew"
    },
    async (tx, championship, actor) => {
      const [participant] = await tx
        .select()
        .from(championshipParticipants)
        .where(
          and(
            eq(championshipParticipants.championshipId, championship.id),
            eq(championshipParticipants.accountId, actor.account.id)
          )
        );

      if (!participant) {
        throw notFound("Championship registration not found");
      }

      if (!["pending", "active"].includes(participant.status)) {
        throw badRequest("Championship registration is not active");
      }

      await assertParticipantNotRostered(tx, participant.id);
      const now = new Date().toISOString();
      await tx
        .update(championshipParticipants)
        .set({
          status: "withdrawn",
          withdrawnAt: now,
          revision: participant.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipParticipants.id, participant.id));
      const response = await getChampionshipParticipantFrom(
        tx,
        championship.id,
        participant.uuid
      );

      return {
        response: () => response,
        targetType: "participant",
        targetUuid: participant.uuid,
        before: { status: participant.status },
        after: response,
        reason: input.reason ?? null,
        outboxTopic: "championship.participant.withdrawn"
      };
    }
  );
}

export async function updateChampionshipParticipant(
  championshipUuid: string,
  participantUuid: string,
  input: UpdateChampionshipParticipantInput
): Promise<ChampionshipParticipantResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "participant.status-changed"
    },
    async (tx, championship, actor) => {
      assertRegistrationLifecycle(championship.lifecycle);
      const [participant] = await tx
        .select()
        .from(championshipParticipants)
        .where(
          and(
            eq(championshipParticipants.championshipId, championship.id),
            eq(championshipParticipants.uuid, participantUuid)
          )
        );

      if (!participant) {
        throw notFound("Championship participant not found");
      }

      if (participant.status === input.status) {
        throw badRequest(`Participant is already ${input.status}`);
      }

      if (["withdrawn", "ineligible", "removed"].includes(input.status)) {
        await assertParticipantNotRostered(tx, participant.id);
      }

      const [existingPrice] = await tx
        .select()
        .from(championshipParticipantPrices)
        .where(
          and(
            eq(championshipParticipantPrices.championshipId, championship.id),
            eq(championshipParticipantPrices.participantId, participant.id)
          )
        );

      if (["pending", "active"].includes(input.status) && !existingPrice) {
        assertLateParticipantPrice(championship, input.priceUnits);
      } else if (input.priceUnits !== undefined) {
        throw conflict(
          championship.priceState === "locked"
            ? "Frozen participant prices cannot be changed"
            : "Use the salary valuation endpoint to change an existing price"
        );
      }

      const now = new Date().toISOString();
      await tx
        .update(championshipParticipants)
        .set({
          status: input.status,
          withdrawnAt: input.status === "withdrawn" ? now : null,
          revision: participant.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipParticipants.id, participant.id));
      await createParticipantPriceIfProvided(tx, {
        championshipId: championship.id,
        participantId: participant.id,
        priceUnits: input.priceUnits,
        frozen: championship.priceState === "locked",
        actorAccountId: actor.account.id,
        now
      });
      const response = await getChampionshipParticipantFrom(
        tx,
        championship.id,
        participant.uuid
      );

      return {
        response: () => response,
        targetType: "participant",
        targetUuid: participant.uuid,
        before: { status: participant.status },
        after: response,
        reason: input.reason,
        outboxTopic: "championship.participant.status-changed"
      };
    }
  );
}

function assertRegistrationLifecycle(lifecycle: string): void {
  if (
    !mutableChampionshipLifecycles.includes(
      lifecycle as (typeof mutableChampionshipLifecycles)[number]
    )
  ) {
    throw badRequest(
      "Championship registration cannot change in its current lifecycle"
    );
  }
}

async function assertAccountNotRegistered(
  tx: DbTransaction,
  championshipId: number,
  accountId: number
) {
  const [existing] = await tx
    .select({ uuid: championshipParticipants.uuid })
    .from(championshipParticipants)
    .where(
      and(
        eq(championshipParticipants.championshipId, championshipId),
        eq(championshipParticipants.accountId, accountId)
      )
    );

  if (existing) {
    throw conflict("Account is already registered for this championship", {
      participantUuid: existing.uuid
    });
  }
}

async function assertParticipantNotRostered(
  tx: DbTransaction,
  participantId: number
) {
  const [membership] = await tx
    .select({ uuid: championshipTeamMemberships.uuid })
    .from(championshipTeamMemberships)
    .where(
      and(
        eq(championshipTeamMemberships.participantId, participantId),
        isNull(championshipTeamMemberships.endedAt)
      )
    );

  if (membership) {
    throw conflict(
      "Rostered participants must be removed from the team first",
      {
        membershipUuid: membership.uuid
      }
    );
  }
}

function assertLateParticipantPrice(
  championship: {
    rules: { salary: { enabled: boolean } };
    priceState: string;
  },
  priceUnits: number | undefined
): void {
  if (!championship.rules.salary.enabled && priceUnits !== undefined) {
    throw badRequest(
      "Participant prices are unavailable when salary management is disabled"
    );
  }

  if (championship.priceState === "locked" && priceUnits === undefined) {
    throw conflict(
      "A frozen price is required when adding an eligible participant after the price lock"
    );
  }
}

async function createParticipantPriceIfProvided(
  tx: DbTransaction,
  input: {
    championshipId: number;
    participantId: number;
    priceUnits: number | undefined;
    frozen: boolean;
    actorAccountId: number;
    now: string;
  }
): Promise<void> {
  if (input.priceUnits === undefined) {
    return;
  }

  await tx.insert(championshipParticipantPrices).values({
    championshipId: input.championshipId,
    participantId: input.participantId,
    priceUnits: input.priceUnits,
    frozenAt: input.frozen ? input.now : null,
    frozenByAccountId: input.frozen ? input.actorAccountId : null,
    revision: 1
  });
}
