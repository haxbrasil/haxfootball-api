import { type Static, t } from "elysia";
import {
  languageCodeSchema,
  valueKeySchema
} from "@/features/localization/http";

export const gameModeUuidSchema = t.String({ format: "uuid" });

export const gameModeNameSchema = t.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z][a-z0-9-]{0,63}$"
});

export const gameModeVisibilitySchema = t.Union([
  t.Literal("visible"),
  t.Literal("hidden")
]);

export const gameModeVisibilityQuerySchema = t.Union([
  gameModeVisibilitySchema,
  t.Literal("all")
]);

export const gameModeReferenceSchema = t.Union([
  t.Object({
    id: gameModeUuidSchema
  }),
  t.Object({
    name: gameModeNameSchema
  })
]);

export const gameModeUuidParamsSchema = t.Object({
  id: gameModeUuidSchema
});

export const gameModeNameParamsSchema = t.Object({
  name: gameModeNameSchema
});

export const listGameModesQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  visibility: t.Optional(gameModeVisibilityQuerySchema),
  language: t.Optional(languageCodeSchema)
});

export const gameModeLanguageQuerySchema = t.Object({
  language: t.Optional(languageCodeSchema)
});

export type GameModeReference = Static<typeof gameModeReferenceSchema>;
export type ListGameModesQuery = Static<typeof listGameModesQuerySchema>;
export type GameModeLanguageQuery = Static<typeof gameModeLanguageQuerySchema>;
export { valueKeySchema };
