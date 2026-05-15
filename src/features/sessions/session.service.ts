import { password } from "bun";
import {
  toSessionAccount,
  type ConfirmSessionInput,
  type ConfirmSessionResponse,
  type ResolveSessionResponse,
  type SessionIdentityInput
} from "@/features/sessions/session.contract";
import {
  clearAuthFromOtherAccounts,
  findSessionAccountByAuth,
  findSessionAccountByName,
  setAccountAuth,
  upsertSessionPlayer,
  type SessionPlayerIdentity
} from "@/features/sessions/session.persistence";

export async function resolveSession(
  input: SessionIdentityInput
): Promise<ResolveSessionResponse> {
  const identity = normalizeSessionIdentity(input);
  const accountByAuth = identity.auth
    ? await findSessionAccountByAuth(identity.auth)
    : null;

  if (accountByAuth) {
    const player = await upsertSessionPlayer({
      identity: { ...identity, name: accountByAuth.name },
      accountId: accountByAuth.id
    });

    return {
      status: "signed_in",
      playerId: player.externalId,
      account: toSessionAccount(accountByAuth),
      canonicalName: accountByAuth.name
    };
  }

  const accountByName = await findSessionAccountByName(identity.name);

  if (accountByName) {
    const player = await upsertSessionPlayer({ identity });

    return {
      status: "password_required",
      playerId: player.externalId,
      account: toSessionAccount(accountByName)
    };
  }

  const player = await upsertSessionPlayer({ identity });

  return {
    status: "guest",
    playerId: player.externalId,
    account: null
  };
}

export async function confirmSession(
  input: ConfirmSessionInput
): Promise<ConfirmSessionResponse> {
  const identity = normalizeSessionIdentity(input);
  const account = await findSessionAccountByName(identity.name);

  if (!account) {
    return { valid: false };
  }

  const valid = await password.verify(input.password, account.passwordHash);

  if (!valid) {
    return { valid: false };
  }

  const now = new Date().toISOString();

  if (identity.auth) {
    await clearAuthFromOtherAccounts({
      auth: identity.auth,
      accountId: account.id,
      updatedAt: now
    });
  }

  const updatedAccount = identity.auth
    ? await setAccountAuth({
        accountId: account.id,
        auth: identity.auth,
        updatedAt: now
      })
    : account;

  const player = await upsertSessionPlayer({
    identity: { ...identity, name: updatedAccount.name },
    accountId: updatedAccount.id
  });

  return {
    valid: true,
    playerId: player.externalId,
    account: toSessionAccount(updatedAccount),
    canonicalName: updatedAccount.name
  };
}

function normalizeSessionIdentity(
  input: SessionIdentityInput
): SessionPlayerIdentity {
  return {
    roomId: input.roomId,
    roomPlayerId: input.roomPlayerId,
    name: input.name,
    auth: normalizeNullableIdentityValue(input.auth),
    conn: normalizeNullableIdentityValue(input.conn)
  };
}

function normalizeNullableIdentityValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}
