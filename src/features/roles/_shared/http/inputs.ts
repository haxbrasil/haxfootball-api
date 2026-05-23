import { type Static, t } from "elysia";
import { languageCodeSchema } from "@/features/localization/http";
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

export const listRolesQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  language: t.Optional(languageCodeSchema)
});

export const roleLanguageQuerySchema = t.Object({
  language: t.Optional(languageCodeSchema)
});

export type ListRolesQuery = Static<typeof listRolesQuerySchema>;
export type RoleLanguageQuery = Static<typeof roleLanguageQuerySchema>;
