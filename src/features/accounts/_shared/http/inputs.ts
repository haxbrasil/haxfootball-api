import { t } from "elysia";

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

export const accountUuidParamsSchema = t.Object({
  uuid: t.String({ format: "uuid" })
});
