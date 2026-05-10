import { type Static, t } from "elysia";
import { defaultRoleName, type Role } from "@/features/roles/role.db";

export const roleNameSchema = t.String({
  minLength: 1,
  maxLength: 25,
  pattern: "^[a-z0-9-]+$"
});

export const roleTitleSchema = t.String({
  minLength: 1
});

export const roleResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  title: t.String({ minLength: 1 }),
  isDefault: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export type RoleResponse = Static<typeof roleResponseSchema>;

export function toRoleResponse(role: Role): RoleResponse {
  return {
    uuid: role.uuid,
    name: role.name,
    title: role.title,
    isDefault: role.name === defaultRoleName,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt
  };
}

export const roleUuidParamsSchema = t.Object({
  uuid: t.String({ format: "uuid" })
});
