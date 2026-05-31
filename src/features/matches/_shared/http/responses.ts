import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/db";
import {
  gameModeResponseSchema,
  toGameModeResponse
} from "@/features/game-modes/http";
import type { GameMode } from "@/features/game-modes/db";
import type {
  Match,
  MatchPlayerStint,
  MatchTeamMetadata
} from "@/features/matches/db";
import {
  matchFieldTeamSchema,
  matchPublicIdSchema,
  matchScoreSchema,
  matchStatusSchema,
  type MatchScore
} from "@/features/matches/_shared/http/inputs";
import {
  matchEventResponseSchema,
  toMatchEventResponse,
  type MatchEventRow
} from "@/features/match-events/http";
import {
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/responses";
import type { Player } from "@/features/players/db";
import {
  recordingResponseSchema,
  toRecordingResponse
} from "@/features/recordings/http";
import type { Recording } from "@/features/recordings/db";
import { eventSchemaReferenceSchema } from "@/features/event-schemas/http";
import type {
  EventSchemaFamily,
  EventSchemaVersion
} from "@/features/event-schemas/db";
import { paginatedResponseSchema } from "@lib";

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
  gameMode: t.Nullable(gameModeResponseSchema),
  eventSchema: t.Nullable(eventSchemaReferenceSchema),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const matchResponseSchema = t.Intersect([
  matchSummaryResponseSchema,
  t.Object({
    events: t.Array(matchEventResponseSchema),
    participations: t.Array(matchPlayerStintResponseSchema)
  })
]);

export const listMatchesResponseSchema = paginatedResponseSchema(
  matchSummaryResponseSchema
);

export type MatchSummaryResponse = Static<typeof matchSummaryResponseSchema>;
export type MatchResponse = Static<typeof matchResponseSchema>;

type PlayerRow = {
  player: Player;
  account: Account | null;
};

export type MatchSummaryRow = {
  match: Match;
  recording: Recording | null;
  gameMode: GameMode | null;
  eventSchemaFamily: EventSchemaFamily | null;
  eventSchemaVersion: EventSchemaVersion | null;
  metadata: MatchTeamMetadata[];
};

export type MatchDetailRow = MatchSummaryRow & {
  events: MatchEventRow[];
  stints: Array<MatchPlayerStint & PlayerRow>;
};

export function toMatchSummaryResponse({
  match,
  recording,
  gameMode,
  eventSchemaFamily,
  eventSchemaVersion,
  metadata
}: MatchSummaryRow): MatchSummaryResponse {
  return {
    id: match.publicId,
    status: match.status,
    initiatedAt: match.initiatedAt,
    endedAt: match.endedAt,
    score: toMatchScore(metadata),
    recording: recording ? toRecordingResponse(recording) : null,
    gameMode: gameMode ? toGameModeResponse(gameMode) : null,
    eventSchema: toMatchEventSchemaReference({
      family: eventSchemaFamily,
      version: eventSchemaVersion
    }),
    createdAt: match.createdAt,
    updatedAt: match.updatedAt
  };
}

export function toMatchResponse(row: MatchDetailRow): MatchResponse {
  return {
    ...toMatchSummaryResponse(row),
    events: row.events.map(toMatchEventResponse),
    participations: row.stints.map((stint) => ({
      player: toPlayerResponse({
        player: stint.player,
        account: stint.account
      }),
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

function toMatchEventSchemaReference(input: {
  family: EventSchemaFamily | null;
  version: EventSchemaVersion | null;
}): Static<typeof eventSchemaReferenceSchema> | null {
  if (!input.family || !input.version) {
    return null;
  }

  return {
    id: input.family.uuid,
    version: input.version.version
  };
}
