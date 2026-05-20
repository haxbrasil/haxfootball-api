import { type Static, t } from "elysia";
import type { Permission } from "@/features/permissions/db";

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
