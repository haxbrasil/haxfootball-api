import { type Static, t } from "elysia";
import { permissionKeySchema } from "@/features/permissions/permission.contract";
import { defaultRoleName, type Role } from "@/features/roles/role.db";

export const roleNameSchema = t.String({
  minLength: 1,
  maxLength: 25,
  pattern: "^[a-z0-9-]+$"
});

export const roleTitleSchema = t.String({
  minLength: 1
});

export const rolePermissionsSchema = t.Array(permissionKeySchema, {
  default: [],
  uniqueItems: true
});

export const roleResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  title: t.String({ minLength: 1 }),
  permissions: rolePermissionsSchema,
  isDefault: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export type RoleResponse = Static<typeof roleResponseSchema>;

export type RoleWithPermissions = {
  role: Role;
  permissions: string[];
};

export function toRoleResponse({
  role,
  permissions
}: RoleWithPermissions): RoleResponse {
  return {
    uuid: role.uuid,
    name: role.name,
    title: role.title,
    permissions,
    isDefault: role.name === defaultRoleName,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt
  };
}

export const roleUuidParamsSchema = t.Object({
  uuid: t.String({ format: "uuid" })
});
