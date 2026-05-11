import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/account.db";
import {
  type PlayerResponse,
  toPlayerResponse
} from "@/features/players/player.contract";
import { players } from "@/features/players/player.db";
import { badRequest, notFound } from "@/shared/http/errors";

export const associatePlayerAccountBodySchema = t.Object({
  accountUuid: t.String({ format: "uuid" })
});

export type AssociatePlayerAccountInput = Static<
  typeof associatePlayerAccountBodySchema
>;

export async function associatePlayerAccount(
  externalId: string,
  input: AssociatePlayerAccountInput
): Promise<PlayerResponse> {
  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.externalId, externalId));

  if (!player) {
    throw notFound("Player not found");
  }

  if (player.accountId) {
    throw badRequest("Player is already associated with an account");
  }

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.uuid, input.accountUuid));

  if (!account) {
    throw notFound("Account not found");
  }

  const [updatedPlayer] = await db
    .update(players)
    .set({
      accountId: account.id,
      updatedAt: new Date().toISOString()
    })
    .where(eq(players.externalId, externalId))
    .returning();

  return toPlayerResponse({ player: updatedPlayer, account });
}
