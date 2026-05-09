import { type Static, t } from "elysia";
import { type Account } from "./account.db";

export const accountNameSchema = t.String({
  minLength: 1,
  maxLength: 25,
  pattern: ".*[A-Za-z0-9].*"
});

export const accountPasswordSchema = t.String({
  minLength: 4,
  maxLength: 19
});

export const accountExternalIdSchema = t.String({
  pattern: "^[0-9]{17,20}$"
});

export const accountResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  externalId: t.String(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export type AccountResponse = Static<typeof accountResponseSchema>;

export function toAccountResponse(account: Account): AccountResponse {
  return {
    uuid: account.uuid,
    name: account.name,
    externalId: account.externalId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

export const accountUuidParamsSchema = t.Object({
  uuid: t.String({ format: "uuid" })
});
