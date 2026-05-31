import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/db";
import type { MatchEvent } from "@/features/match-events/db";
import {
  matchEventDomainSchema,
  matchEventIdSchema,
  matchEventScopeSchema,
  matchEventTeamSchema
} from "@/features/match-events/_shared/http/inputs";
import {
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/responses";
import type { Player } from "@/features/players/db";
import { paginatedResponseSchema } from "@lib";

export const matchEventResponseSchema = t.Object({
  id: matchEventIdSchema,
  sequence: t.Integer({ minimum: 1 }),
  domain: matchEventDomainSchema,
  type: t.String(),
  scope: matchEventScopeSchema,
  actorPlayer: t.Nullable(playerResponseSchema),
  subjectPlayer: t.Nullable(playerResponseSchema),
  team: t.Nullable(matchEventTeamSchema),
  roomPlayerId: t.Nullable(t.Number()),
  playId: t.Nullable(t.String()),
  sourceState: t.Nullable(t.String()),
  value: t.Unknown(),
  occurredAt: t.Nullable(t.String()),
  elapsedSeconds: t.Nullable(t.Number()),
  tick: t.Nullable(t.Number()),
  disabled: t.Boolean(),
  disabledAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listMatchEventsResponseSchema = paginatedResponseSchema(
  matchEventResponseSchema
);

export const matchMetricsResponseSchema = t.Array(
  t.Object({
    player: playerResponseSchema,
    metrics: t.Record(t.String(), t.Unknown())
  })
);

export type MatchEventResponse = Static<typeof matchEventResponseSchema>;
export type MatchMetricsResponse = Static<typeof matchMetricsResponseSchema>;

export type MatchEventRow = MatchEvent & {
  actorPlayer: Player | null;
  actorAccount: Account | null;
  subjectPlayer: Player | null;
  subjectAccount: Account | null;
};

export function toMatchEventResponse(row: MatchEventRow): MatchEventResponse {
  return {
    id: row.uuid,
    sequence: row.sequence,
    domain: row.domain,
    type: row.type,
    scope: row.scope,
    actorPlayer: row.actorPlayer
      ? toPlayerResponse({
          player: row.actorPlayer,
          account: row.actorAccount
        })
      : null,
    subjectPlayer: row.subjectPlayer
      ? toPlayerResponse({
          player: row.subjectPlayer,
          account: row.subjectAccount
        })
      : null,
    team: row.team,
    roomPlayerId: row.roomPlayerId,
    playId: row.playId,
    sourceState: row.sourceState,
    value: row.value,
    occurredAt: row.occurredAt,
    elapsedSeconds: row.elapsedSeconds,
    tick: row.tick,
    disabled: row.disabledAt !== null,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
