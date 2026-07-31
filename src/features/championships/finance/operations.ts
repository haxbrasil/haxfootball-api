import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import { championships } from "@/features/championships/core/db";
import { championshipParticipantPrices } from "@/features/championships/finance/db";
import { getChampionshipSalaryProjectionFrom } from "@/features/championships/finance/projections";
import { championshipParticipants } from "@/features/championships/people/db";
import type {
  FreezeChampionshipPricesInput,
  UpsertChampionshipPricesInput
} from "@/features/championships/_shared/http/inputs";
import type { ChampionshipSalaryProjectionResponse } from "@/features/championships/_shared/http/responses";
import { badRequest, conflict } from "@/shared/http/errors";

const defaultSalaryProjectionQuery = {
  participantLimit: 100,
  teamLimit: 100
};

export async function upsertChampionshipPrices(
  championshipUuid: string,
  input: UpsertChampionshipPricesInput
): Promise<ChampionshipSalaryProjectionResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "salary.prices-upserted"
    },
    async (tx, championship) => {
      assertPricesEditable(championship);
      const participantUuids = input.prices.map(
        ({ participantId }) => participantId
      );

      if (new Set(participantUuids).size !== participantUuids.length) {
        throw badRequest(
          "Each participant may appear only once in a price batch"
        );
      }

      const participantRows = await tx
        .select({
          id: championshipParticipants.id,
          uuid: championshipParticipants.uuid
        })
        .from(championshipParticipants)
        .where(
          and(
            eq(championshipParticipants.championshipId, championship.id),
            inArray(championshipParticipants.uuid, participantUuids)
          )
        );

      if (participantRows.length !== participantUuids.length) {
        throw badRequest(
          "One or more price entries reference an unknown championship participant"
        );
      }

      const participantIdByUuid = new Map(
        participantRows.map((participant) => [participant.uuid, participant.id])
      );
      const existingRows = await tx
        .select()
        .from(championshipParticipantPrices)
        .where(
          and(
            eq(championshipParticipantPrices.championshipId, championship.id),
            inArray(
              championshipParticipantPrices.participantId,
              participantRows.map(({ id }) => id)
            )
          )
        );
      const existingByParticipantId = new Map(
        existingRows.map((price) => [price.participantId, price])
      );
      const now = new Date().toISOString();

      for (const price of input.prices) {
        const participantId = participantIdByUuid.get(price.participantId)!;
        const existing = existingByParticipantId.get(participantId);

        if (existing) {
          await tx
            .update(championshipParticipantPrices)
            .set({
              priceUnits: price.priceUnits,
              revision: existing.revision + 1,
              updatedAt: now
            })
            .where(eq(championshipParticipantPrices.id, existing.id));
        } else {
          await tx.insert(championshipParticipantPrices).values({
            championshipId: championship.id,
            participantId,
            priceUnits: price.priceUnits,
            revision: 1
          });
        }
      }

      const projection = await getChampionshipSalaryProjectionFrom(
        tx,
        championship.uuid,
        defaultSalaryProjectionQuery,
        "admin"
      );

      return {
        response: () => projection,
        targetType: "salary-prices",
        targetUuid: championship.uuid,
        before: {
          updatedParticipantIds: participantUuids,
          priceState: championship.priceState
        },
        after: input.prices,
        metadata: { count: input.prices.length },
        outboxTopic: "championship.salary.prices-updated"
      };
    }
  );
}

export async function freezeChampionshipPrices(
  championshipUuid: string,
  input: FreezeChampionshipPricesInput
): Promise<ChampionshipSalaryProjectionResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "salary.prices-frozen"
    },
    async (tx, championship, actor) => {
      assertPricesEditable(championship);

      if (championship.registrationState !== "closed") {
        throw conflict("Registration must be closed before prices are frozen", {
          registrationState: championship.registrationState
        });
      }

      const [missing] = await tx
        .select({ value: count() })
        .from(championshipParticipants)
        .leftJoin(
          championshipParticipantPrices,
          and(
            eq(
              championshipParticipantPrices.participantId,
              championshipParticipants.id
            ),
            eq(
              championshipParticipantPrices.championshipId,
              championshipParticipants.championshipId
            )
          )
        )
        .where(
          and(
            eq(championshipParticipants.championshipId, championship.id),
            inArray(championshipParticipants.status, ["pending", "active"]),
            isNull(championshipParticipantPrices.id)
          )
        );

      if ((missing?.value ?? 0) > 0) {
        throw conflict("Every registered participant needs a price", {
          missingPriceCount: missing!.value
        });
      }

      const now = new Date().toISOString();
      await tx
        .update(championshipParticipantPrices)
        .set({
          frozenAt: now,
          frozenByAccountId: actor.account.id,
          updatedAt: now
        })
        .where(
          eq(championshipParticipantPrices.championshipId, championship.id)
        );
      await tx
        .update(championships)
        .set({ priceState: "locked" })
        .where(eq(championships.id, championship.id));
      const projection = await getChampionshipSalaryProjectionFrom(
        tx,
        championship.uuid,
        defaultSalaryProjectionQuery,
        "admin"
      );

      return {
        response: () => projection,
        targetType: "salary-prices",
        targetUuid: championship.uuid,
        before: { priceState: championship.priceState },
        after: {
          priceState: "locked",
          frozenAt: now
        },
        reason: input.reason ?? null,
        outboxTopic: "championship.salary.prices-frozen"
      };
    }
  );
}

function assertPricesEditable(championship: {
  rules: { salary: { enabled: boolean } };
  priceState: string;
}): void {
  if (!championship.rules.salary.enabled) {
    throw badRequest("Salary management is disabled for this championship");
  }

  if (championship.priceState !== "editable") {
    throw conflict("Championship prices are not editable", {
      priceState: championship.priceState
    });
  }
}
