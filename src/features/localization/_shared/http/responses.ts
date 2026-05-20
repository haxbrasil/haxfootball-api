import { type Static, t } from "elysia";
import type { Language, Value } from "@/features/localization/db";
import {
  languageCodeSchema,
  valueKeySchema
} from "@/features/localization/_shared/http/inputs";
import { paginatedResponseSchema } from "@lib";

export const languageResponseSchema = t.Object({
  code: languageCodeSchema,
  name: t.String(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const valueLabelResponseSchema = t.Object({
  language: languageResponseSchema,
  label: t.String()
});

export const valueResponseSchema = t.Object({
  value: valueKeySchema,
  labels: t.Array(valueLabelResponseSchema)
});

export const listLanguagesResponseSchema = paginatedResponseSchema(
  languageResponseSchema
);

export type LanguageResponse = Static<typeof languageResponseSchema>;
export type ValueResponse = Static<typeof valueResponseSchema>;

export type ValueWithLanguage = {
  value: Value;
  language: Language;
};

export function toLanguageResponse(language: Language): LanguageResponse {
  return {
    code: language.code,
    name: language.name,
    createdAt: language.createdAt,
    updatedAt: language.updatedAt
  };
}

export function toValueResponse(
  value: string,
  rows: ValueWithLanguage[]
): ValueResponse {
  return {
    value,
    labels: rows.map((row) => ({
      language: toLanguageResponse(row.language),
      label: row.value.label
    }))
  };
}
