import { t } from "elysia";
import { permissionKeySchema } from "@/features/permissions/http";

export const roleNameSchema = t.String({
  minLength: 1,
  maxLength: 25,
  pattern: "^[a-z0-9-]+$"
});

export const roleTitleSchema = t.String({
  minLength: 1
});

export const allPermissionsWildcard = "*";

export const rolePermissionInputKeySchema = t.Union([
  permissionKeySchema,
  t.Literal(allPermissionsWildcard)
]);

export const rolePermissionsSchema = t.Array(permissionKeySchema, {
  default: [],
  uniqueItems: true
});

export const rolePermissionInputSchema = t.Array(rolePermissionInputKeySchema, {
  default: [],
  uniqueItems: true
});

export const roleUuidParamsSchema = t.Object({
  uuid: t.String({ format: "uuid" })
});
