import { t } from "elysia";

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

export const permissionUuidParamsSchema = t.Object({
  uuid: t.String({ format: "uuid" })
});
