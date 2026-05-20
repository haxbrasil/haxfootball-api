import { type Static, t } from "elysia";

export const matchStatEventIdSchema = t.String({ format: "uuid" });

export const matchStatEventInputSchema = t.Object({
  type: t.String({
    minLength: 1,
    maxLength: 64,
    pattern: "^[a-z][a-z0-9-]{0,63}$"
  }),
  playerId: t.String({ minLength: 1, maxLength: 64 }),
  value: t.Unknown(),
  occurredAt: t.Optional(t.String({ minLength: 1 })),
  tick: t.Optional(t.Number({ minimum: 0 }))
});

export const matchStatEventIdParamsSchema = t.Object({
  id: t.String({ minLength: 8, maxLength: 8, pattern: "^[a-z2-9]{8}$" }),
  eventId: matchStatEventIdSchema
});

export type MatchStatEventInput = Static<typeof matchStatEventInputSchema>;
