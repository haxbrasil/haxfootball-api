import { type Static, t } from "elysia";
import type { MatchStatEvent } from "@/features/match-stat-events/match-stat-event.db";
import {
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/player.contract";
import type { Player } from "@/features/players/player.db";

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

export const matchStatEventResponseSchema = t.Object({
  id: matchStatEventIdSchema,
  sequence: t.Integer({ minimum: 1 }),
  type: t.String(),
  player: playerResponseSchema,
  value: t.Unknown(),
  occurredAt: t.Nullable(t.String()),
  tick: t.Nullable(t.Number()),
  disabled: t.Boolean(),
  disabledAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listMatchStatEventsResponseSchema = t.Array(
  matchStatEventResponseSchema
);

export const matchStatEventIdParamsSchema = t.Object({
  id: t.String({ minLength: 8, maxLength: 8, pattern: "^[a-z2-9]{8}$" }),
  eventId: matchStatEventIdSchema
});

export const matchMetricsResponseSchema = t.Array(
  t.Object({
    player: playerResponseSchema,
    metrics: t.Record(t.String(), t.Unknown())
  })
);

export type MatchStatEventInput = Static<typeof matchStatEventInputSchema>;
export type MatchStatEventResponse = Static<typeof matchStatEventResponseSchema>;
export type MatchMetricsResponse = Static<typeof matchMetricsResponseSchema>;

export type MatchStatEventRow = MatchStatEvent & {
  player: Player;
};

export function toMatchStatEventResponse(
  row: MatchStatEventRow
): MatchStatEventResponse {
  return {
    id: row.uuid,
    sequence: row.sequence,
    type: row.type,
    player: toPlayerResponse({ player: row.player, account: null }),
    value: row.value,
    occurredAt: row.occurredAt,
    tick: row.tick,
    disabled: row.disabledAt !== null,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
