import { type Static, t } from "elysia";

export const matchEventIdSchema = t.String({ format: "uuid" });

export const matchEventDomainSchema = t.Union([
  t.Literal("room"),
  t.Literal("game"),
  t.Literal("agent"),
  t.Literal("system")
]);

export const matchEventScopeSchema = t.Union([
  t.Literal("player"),
  t.Literal("team"),
  t.Literal("match")
]);

export const matchEventTeamSchema = t.Union([
  t.Literal("spectators"),
  t.Literal("red"),
  t.Literal("blue")
]);

export const matchEventInputSchema = t.Object({
  domain: matchEventDomainSchema,
  type: t.String({
    minLength: 1,
    maxLength: 64,
    pattern: "^[a-z][a-z0-9-]{0,63}$"
  }),
  scope: matchEventScopeSchema,
  actorPlayerId: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
  subjectPlayerId: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
  team: t.Optional(matchEventTeamSchema),
  roomPlayerId: t.Optional(t.Integer({ minimum: 0 })),
  playId: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
  sourceState: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
  value: t.Unknown(),
  occurredAt: t.Optional(t.String({ minLength: 1 })),
  elapsedSeconds: t.Optional(t.Number({ minimum: 0 })),
  tick: t.Optional(t.Number({ minimum: 0 }))
});

export const matchEventIdParamsSchema = t.Object({
  id: t.String({ minLength: 8, maxLength: 8, pattern: "^[a-z2-9]{8}$" }),
  eventId: matchEventIdSchema
});

export type MatchEventInput = Static<typeof matchEventInputSchema>;
export type MatchEventDomain = Static<typeof matchEventDomainSchema>;
export type MatchEventScope = Static<typeof matchEventScopeSchema>;
export type MatchEventTeam = Static<typeof matchEventTeamSchema>;
