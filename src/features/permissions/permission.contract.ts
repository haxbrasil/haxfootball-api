import { type Static, t } from "elysia";
import type { Permission } from "@/features/permissions/permission.db";

export const permissionKeySchema = t.String({
  minLength: 1,
  maxLength: 100,
  pattern: "^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$"
});

export const permissionTitleSchema = t.String({
  minLength: 1
});

export const permissionTitleInputSchema = t.Union([
  permissionTitleSchema,
  t.Null()
]);

export const permissionResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  key: t.String(),
  title: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String()
});

export type PermissionResponse = Static<typeof permissionResponseSchema>;

export function toPermissionResponse(
  permission: Permission
): PermissionResponse {
  return {
    uuid: permission.uuid,
    key: permission.key,
    title: permission.title,
    createdAt: permission.createdAt,
    updatedAt: permission.updatedAt
  };
}

export const permissionUuidParamsSchema = t.Object({
  uuid: t.String({ format: "uuid" })
});
