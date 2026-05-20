import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/db";
import type { MatchStatEvent } from "@/features/match-stat-events/db";
import { matchStatEventIdSchema } from "@/features/match-stat-events/_shared/http/inputs";
import {
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/http";
import type { Player } from "@/features/players/db";
import { paginatedResponseSchema } from "@lib";

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

export const listMatchStatEventsResponseSchema = paginatedResponseSchema(
  matchStatEventResponseSchema
);

export const matchMetricsResponseSchema = t.Array(
  t.Object({
    player: playerResponseSchema,
    metrics: t.Record(t.String(), t.Unknown())
  })
);

export type MatchStatEventResponse = Static<
  typeof matchStatEventResponseSchema
>;
export type MatchMetricsResponse = Static<typeof matchMetricsResponseSchema>;

export type MatchStatEventRow = MatchStatEvent & {
  player: Player;
  account: Account | null;
};

export function toMatchStatEventResponse(
  row: MatchStatEventRow
): MatchStatEventResponse {
  return {
    id: row.uuid,
    sequence: row.sequence,
    type: row.type,
    player: toPlayerResponse({ player: row.player, account: row.account }),
    value: row.value,
    occurredAt: row.occurredAt,
    tick: row.tick,
    disabled: row.disabledAt !== null,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
