import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts, type Account } from "@/features/accounts/account.db";
import { players, type Player } from "@/features/players/player.db";

export type SessionPlayerIdentity = {
  roomId: string;
  roomPlayerId: number;
  name: string;
  auth: string | null;
  conn: string | null;
};

export async function findSessionAccountByAuth(
  auth: string
): Promise<Account | null> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.auth, auth));

  return account ?? null;
}

export async function findSessionAccountByName(
  name: string
): Promise<Account | null> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.name, name));

  return account ?? null;
}

export async function clearAuthFromOtherAccounts(input: {
  auth: string;
  accountId: number;
  updatedAt: string;
}): Promise<void> {
  await db
    .update(accounts)
    .set({
      auth: null,
      updatedAt: input.updatedAt
    })
    .where(
      and(eq(accounts.auth, input.auth), ne(accounts.id, input.accountId))
    );
}

export async function setAccountAuth(input: {
  accountId: number;
  auth: string;
  updatedAt: string;
}): Promise<Account> {
  const [account] = await db
    .update(accounts)
    .set({
      auth: input.auth,
      updatedAt: input.updatedAt
    })
    .where(eq(accounts.id, input.accountId))
    .returning();

  return account;
}

export async function upsertSessionPlayer(input: {
  identity: SessionPlayerIdentity;
  accountId?: number;
}): Promise<Player> {
  const identityKey = await createPlayerIdentityKey(input.identity);
  const [existingPlayer] = await db
    .select()
    .from(players)
    .where(eq(players.identityKey, identityKey));

  if (existingPlayer) {
    const [player] = await db
      .update(players)
      .set({
        roomId: input.identity.roomId,
        roomPlayerId: input.identity.roomPlayerId,
        auth: input.identity.auth,
        conn: input.identity.conn,
        name: input.identity.name,
        ...(input.accountId !== undefined
          ? { accountId: input.accountId }
          : {}),
        updatedAt: new Date().toISOString()
      })
      .where(eq(players.id, existingPlayer.id))
      .returning();

    return player;
  }

  const [player] = await db
    .insert(players)
    .values({
      externalId: crypto.randomUUID(),
      identityKey,
      roomId: input.identity.roomId,
      roomPlayerId: input.identity.roomPlayerId,
      auth: input.identity.auth,
      conn: input.identity.conn,
      name: input.identity.name,
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {})
    })
    .returning();

  return player;
}

async function createPlayerIdentityKey(
  identity: SessionPlayerIdentity
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      identity.roomId,
      identity.roomPlayerId,
      identity.auth,
      identity.conn,
      identity.name
    ])
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
