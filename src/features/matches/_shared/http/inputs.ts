import { type Static, t } from "elysia";
import type { GameModeReference } from "@/features/game-modes/http";
import { gameModeNameSchema } from "@/features/game-modes/http";
import type { EventSchemaReference } from "@/features/event-schemas/http";
import { matchEventInputSchema } from "@/features/match-events/http";

export const matchStatusSchema = t.Union([
  t.Literal("ongoing"),
  t.Literal("completed")
]);

export const matchPublicIdSchema = t.String({
  minLength: 8,
  maxLength: 8,
  pattern: "^[a-z2-9]{8}$"
});

export const composedMatchPublicIdSchema = t.String({
  minLength: 9,
  maxLength: 9,
  pattern: "^c[a-z2-9]{8}$"
});

export const logicalMatchPublicIdSchema = t.Union([
  matchPublicIdSchema,
  composedMatchPublicIdSchema
]);

export const matchTeamSchema = t.Union([
  t.Literal("spectators"),
  t.Literal("red"),
  t.Literal("blue")
]);

export const matchFieldTeamSchema = t.Union([
  t.Literal("red"),
  t.Literal("blue")
]);

export const matchScoreSchema = t.Object({
  red: t.Integer({ minimum: 0 }),
  blue: t.Integer({ minimum: 0 })
});

export const matchPublicIdParamsSchema = t.Object({
  id: matchPublicIdSchema
});

export const logicalMatchPublicIdParamsSchema = t.Object({
  id: logicalMatchPublicIdSchema
});

export const composedMatchPublicIdParamsSchema = t.Object({
  id: composedMatchPublicIdSchema
});

export const listMatchesQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  gameMode: t.Optional(gameModeNameSchema)
});

export const sequentialMatchRoundInputSchema = t.Object({
  kind: t.Literal("sequential"),
  number: t.Integer({ minimum: 1 }),
  matchId: logicalMatchPublicIdSchema
});

export const extraTimeMatchRoundInputSchema = t.Object({
  kind: t.Literal("extra-time"),
  number: t.Null(),
  matchId: logicalMatchPublicIdSchema
});

export const matchRoundInputSchema = t.Union([
  sequentialMatchRoundInputSchema,
  extraTimeMatchRoundInputSchema
]);

export const matchCompositionRoundsBodySchema = t.Object({
  rounds: t.Array(matchRoundInputSchema, { minItems: 2 })
});

export type MatchStatus = Static<typeof matchStatusSchema>;
export type MatchTeam = Static<typeof matchTeamSchema>;
export type MatchFieldTeam = Static<typeof matchFieldTeamSchema>;
export type MatchScore = Static<typeof matchScoreSchema>;
export type MatchEventInput = Static<typeof matchEventInputSchema>;
export type ListMatchesQuery = Static<typeof listMatchesQuerySchema>;
export type MatchRoundInput = Static<typeof matchRoundInputSchema>;
export type MatchCompositionRoundsInput = Static<
  typeof matchCompositionRoundsBodySchema
>;
export type { GameModeReference };
export type { EventSchemaReference };
export { matchEventInputSchema };
