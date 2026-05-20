import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/db";
import type {
  Match,
  MatchPlayerEvent,
  MatchPlayerStint,
  MatchTeamMetadata
} from "@/features/matches/db";
import {
  matchFieldTeamSchema,
  matchPlayerEventTypeSchema,
  matchPublicIdSchema,
  matchScoreSchema,
  matchStatusSchema,
  matchTeamSchema,
  type MatchScore
} from "@/features/matches/_shared/http/inputs";
import {
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/http";
import type { Player } from "@/features/players/db";
import {
  recordingResponseSchema,
  toRecordingResponse
} from "@/features/recordings/http";
import type { Recording } from "@/features/recordings/db";
import { statEventSchemaReferenceSchema } from "@/features/stat-event-schemas/http";
import type {
  StatEventSchemaFamily,
  StatEventSchemaVersion
} from "@/features/stat-event-schemas/db";
import { paginatedResponseSchema } from "@lib";

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
      player: toPlayerResponse({
        player: event.player,
        account: event.account
      }),
      team: event.team,
      roomPlayerId: event.roomPlayerId,
      occurredAt: event.occurredAt,
      elapsedSeconds: event.elapsedSeconds
    })),
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

function toMatchStatEventSchemaReference(input: {
  family: StatEventSchemaFamily | null;
  version: StatEventSchemaVersion | null;
}): Static<typeof statEventSchemaReferenceSchema> | null {
  if (!input.family || !input.version) {
    return null;
  }

  return {
    id: input.family.uuid,
    version: input.version.version
  };
}
