import { type Static, t } from "elysia";
import type { Role } from "@/features/roles/role.db";
import { roleResponseSchema, toRoleResponse } from "@/features/roles/role.contract";
import type { Account } from "@/features/accounts/account.db";

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
  role: roleResponseSchema,
  createdAt: t.String(),
  updatedAt: t.String()
});

export type AccountResponse = Static<typeof accountResponseSchema>;

export type AccountWithRole = {
  account: Account;
  role: Role;
};

export function toAccountResponse({
  account,
  role
}: AccountWithRole): AccountResponse {
  return {
    uuid: account.uuid,
    name: account.name,
    externalId: account.externalId,
    role: toRoleResponse(role),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

export const accountUuidParamsSchema = t.Object({
  uuid: t.String({ format: "uuid" })
});
