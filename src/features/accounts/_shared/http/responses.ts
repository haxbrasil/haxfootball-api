import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/db";
import {
  type RoleWithPermissions,
  roleResponseSchema,
  toRoleResponse
} from "@/features/roles/http";

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
  role: RoleWithPermissions;
};

export function toAccountResponse(
  { account, role }: AccountWithRole,
  labels: Map<string, string> = new Map()
): AccountResponse {
  return {
    uuid: account.uuid,
    name: account.name,
    externalId: account.externalId,
    role: toRoleResponse(role, labels),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}
