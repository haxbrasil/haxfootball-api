import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/account.db";

export const sessionIdentityBodySchema = t.Object({
  roomId: t.String({ minLength: 1, maxLength: 64 }),
  roomPlayerId: t.Integer({ minimum: 0 }),
  name: t.String({
    minLength: 1,
    maxLength: 25,
    pattern: ".*[A-Za-z0-9].*"
  }),
  auth: t.Nullable(t.String({ minLength: 1, maxLength: 256 })),
  conn: t.Nullable(t.String({ minLength: 1, maxLength: 256 }))
});

export const confirmSessionBodySchema = t.Intersect([
  sessionIdentityBodySchema,
  t.Object({
    password: t.String({ minLength: 4, maxLength: 19 })
  })
]);

export const sessionAccountSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  externalId: t.String()
});

export const resolveSessionResponseSchema = t.Union([
  t.Object({
    status: t.Literal("guest"),
    playerId: t.String(),
    account: t.Null()
  }),
  t.Object({
    status: t.Literal("signed_in"),
    playerId: t.String(),
    account: sessionAccountSchema,
    canonicalName: t.String()
  }),
  t.Object({
    status: t.Literal("password_required"),
    playerId: t.String(),
    account: sessionAccountSchema
  })
]);

export const confirmSessionResponseSchema = t.Union([
  t.Object({
    valid: t.Literal(false)
  }),
  t.Object({
    valid: t.Literal(true),
    playerId: t.String(),
    account: sessionAccountSchema,
    canonicalName: t.String()
  })
]);

export type SessionIdentityInput = Static<typeof sessionIdentityBodySchema>;
export type ConfirmSessionInput = Static<typeof confirmSessionBodySchema>;
export type SessionAccount = Static<typeof sessionAccountSchema>;
export type ResolveSessionResponse = Static<
  typeof resolveSessionResponseSchema
>;
export type ConfirmSessionResponse = Static<
  typeof confirmSessionResponseSchema
>;

export function toSessionAccount(account: Account): SessionAccount {
  return {
    uuid: account.uuid,
    name: account.name,
    externalId: account.externalId
  };
}
