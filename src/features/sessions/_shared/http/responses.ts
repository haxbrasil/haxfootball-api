import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/db";
import {
  sessionAccountSchema,
  type SessionAccount
} from "@/features/sessions/_shared/http/inputs";

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
