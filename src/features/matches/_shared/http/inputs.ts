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

export const listMatchesQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  gameMode: t.Optional(gameModeNameSchema)
});

export type MatchStatus = Static<typeof matchStatusSchema>;
export type MatchTeam = Static<typeof matchTeamSchema>;
export type MatchFieldTeam = Static<typeof matchFieldTeamSchema>;
export type MatchScore = Static<typeof matchScoreSchema>;
export type MatchEventInput = Static<typeof matchEventInputSchema>;
export type ListMatchesQuery = Static<typeof listMatchesQuerySchema>;
export type { GameModeReference };
export type { EventSchemaReference };
export { matchEventInputSchema };
