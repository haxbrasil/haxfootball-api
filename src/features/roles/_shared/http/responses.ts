import { type Static, t } from "elysia";
import { defaultRoleName, type Role } from "@/features/roles/db";
import { rolePermissionsSchema } from "@/features/roles/_shared/http/inputs";

export const roleResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  title: t.String({ minLength: 1 }),
  permissions: rolePermissionsSchema,
  bypassAllPermissions: t.Boolean(),
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
    bypassAllPermissions: role.bypassAllPermissions,
    isDefault: role.name === defaultRoleName,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt
  };
}
