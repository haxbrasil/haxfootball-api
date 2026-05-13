import { type Static, t } from "elysia";
import type {
  Match,
  MatchPlayerEvent,
  MatchPlayerStint,
  MatchTeamMetadata
} from "@/features/matches/match.db";
import {
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/player.contract";
import type { Player } from "@/features/players/player.db";
import {
  recordingResponseSchema,
  toRecordingResponse
} from "@/features/recordings/recording.contract";
import type { Recording } from "@/features/recordings/recording.db";
import {
  statEventSchemaReferenceSchema,
  type StatEventSchemaReference
} from "@/features/stat-event-schemas/stat-event-schema.contract";
import type {
  StatEventSchemaFamily,
  StatEventSchemaVersion
} from "@/features/stat-event-schemas/stat-event-schema.db";
import { paginatedResponseSchema } from "@lib";

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

export const matchPlayerEventTypeSchema = t.Union([
  t.Literal("player_join"),
  t.Literal("player_leave"),
  t.Literal("player_team_change")
]);

export const matchScoreSchema = t.Object({
  red: t.Integer({ minimum: 0 }),
  blue: t.Integer({ minimum: 0 })
});

export const matchPlayerEventInputSchema = t.Object({
  type: matchPlayerEventTypeSchema,
  playerId: t.String({ minLength: 1, maxLength: 64 }),
  team: t.Optional(matchTeamSchema),
  roomPlayerId: t.Optional(t.Integer({ minimum: 0 })),
  occurredAt: t.Optional(t.String({ minLength: 1 })),
  elapsedSeconds: t.Optional(t.Number({ minimum: 0 }))
});

export const matchPlayerEventResponseSchema = t.Object({
  sequence: t.Number(),
  type: matchPlayerEventTypeSchema,
  player: playerResponseSchema,
  team: t.Nullable(matchTeamSchema),
  roomPlayerId: t.Nullable(t.Number()),
  occurredAt: t.Nullable(t.String()),
  elapsedSeconds: t.Nullable(t.Number())
});

export const matchPlayerStintResponseSchema = t.Object({
  player: playerResponseSchema,
  team: matchFieldTeamSchema,
  roomPlayerId: t.Nullable(t.Number()),
  joinedAt: t.Nullable(t.String()),
  leftAt: t.Nullable(t.String()),
  joinedElapsedSeconds: t.Nullable(t.Number()),
  leftElapsedSeconds: t.Nullable(t.Number())
});

export const matchSummaryResponseSchema = t.Object({
  id: matchPublicIdSchema,
  status: matchStatusSchema,
  initiatedAt: t.Nullable(t.String()),
  endedAt: t.Nullable(t.String()),
  score: t.Nullable(matchScoreSchema),
  recording: t.Nullable(recordingResponseSchema),
  statEventSchema: t.Nullable(statEventSchemaReferenceSchema),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const matchResponseSchema = t.Intersect([
  matchSummaryResponseSchema,
  t.Object({
    events: t.Array(matchPlayerEventResponseSchema),
    participations: t.Array(matchPlayerStintResponseSchema)
  })
]);

export const matchPublicIdParamsSchema = t.Object({
  id: matchPublicIdSchema
});

export const listMatchesResponseSchema = paginatedResponseSchema(
  matchSummaryResponseSchema
);

export type MatchStatus = Static<typeof matchStatusSchema>;
export type MatchTeam = Static<typeof matchTeamSchema>;
export type MatchFieldTeam = Static<typeof matchFieldTeamSchema>;
export type MatchPlayerEventType = Static<typeof matchPlayerEventTypeSchema>;
export type MatchScore = Static<typeof matchScoreSchema>;
export type MatchPlayerEventInput = Static<typeof matchPlayerEventInputSchema>;
export type MatchSummaryResponse = Static<typeof matchSummaryResponseSchema>;
export type MatchResponse = Static<typeof matchResponseSchema>;

type PlayerRow = {
  player: Player;
};

export type MatchSummaryRow = {
  match: Match;
  recording: Recording | null;
  statEventSchemaFamily: StatEventSchemaFamily | null;
  statEventSchemaVersion: StatEventSchemaVersion | null;
  metadata: MatchTeamMetadata[];
};

export type MatchDetailRow = MatchSummaryRow & {
  events: Array<MatchPlayerEvent & PlayerRow>;
  stints: Array<MatchPlayerStint & PlayerRow>;
};

export function toMatchSummaryResponse({
  match,
  recording,
  statEventSchemaFamily,
  statEventSchemaVersion,
  metadata
}: MatchSummaryRow): MatchSummaryResponse {
  return {
    id: match.publicId,
    status: match.status,
    initiatedAt: match.initiatedAt,
    endedAt: match.endedAt,
    score: toMatchScore(metadata),
    recording: recording ? toRecordingResponse(recording) : null,
    statEventSchema: toMatchStatEventSchemaReference({
      family: statEventSchemaFamily,
      version: statEventSchemaVersion
    }),
    createdAt: match.createdAt,
    updatedAt: match.updatedAt
  };
}

export function toMatchResponse(row: MatchDetailRow): MatchResponse {
  return {
    ...toMatchSummaryResponse(row),
    events: row.events.map((event) => ({
      sequence: event.sequence,
      type: event.type,
      player: toPlayerResponse({ player: event.player, account: null }),
      team: event.team,
      roomPlayerId: event.roomPlayerId,
      occurredAt: event.occurredAt,
      elapsedSeconds: event.elapsedSeconds
    })),
    participations: row.stints.map((stint) => ({
      player: toPlayerResponse({ player: stint.player, account: null }),
      team: stint.team,
      roomPlayerId: stint.roomPlayerId,
      joinedAt: stint.joinedAt,
      leftAt: stint.leftAt,
      joinedElapsedSeconds: stint.joinedElapsedSeconds,
      leftElapsedSeconds: stint.leftElapsedSeconds
    }))
  };
}

function toMatchScore(metadata: MatchTeamMetadata[]): MatchScore | null {
  const red = metadata.find((item) => item.team === "red");
  const blue = metadata.find((item) => item.team === "blue");

  if (!red || !blue) {
    return null;
  }

  return {
    red: red.score,
    blue: blue.score
  };
}

function toMatchStatEventSchemaReference(input: {
  family: StatEventSchemaFamily | null;
  version: StatEventSchemaVersion | null;
}): StatEventSchemaReference | null {
  if (!input.family || !input.version) {
    return null;
  }

  return {
    id: input.family.uuid,
    version: input.version.version
  };
}
