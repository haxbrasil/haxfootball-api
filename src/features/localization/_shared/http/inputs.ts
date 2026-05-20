import { type Static, t } from "elysia";

export const languageCodeSchema = t.String({
  minLength: 2,
  maxLength: 16,
  pattern: "^[a-z]{2,3}(-[a-z0-9]{2,8})*$"
});

export const valueKeySchema = t.String({
  minLength: 1,
  maxLength: 128,
  pattern: "^[a-z][a-z0-9.-]{0,127}$"
});

export const bulkUpsertValuesBodySchema = t.Object({
  values: t.Array(
    t.Object({
      value: valueKeySchema,
      language: languageCodeSchema,
      label: t.String({ minLength: 1 })
    }),
    { minItems: 1 }
  )
});

export const valueParamsSchema = t.Object({
  value: valueKeySchema
});

export type BulkUpsertValuesInput = Static<typeof bulkUpsertValuesBodySchema>;
