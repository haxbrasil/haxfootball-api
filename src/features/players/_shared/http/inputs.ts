import { t } from "elysia";

export const playerExternalIdSchema = t.String({
  minLength: 1,
  maxLength: 64
});

export const playerNameSchema = t.String({
  minLength: 1,
  maxLength: 25
});

export const playerCountrySchema = t.String({
  minLength: 2,
  maxLength: 2,
  pattern: "^[a-z]{2}$"
});

export const playerIdParamsSchema = t.Object({
  externalId: t.String({ minLength: 1, maxLength: 64 })
});
