import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/db";
import {
  gameModeResponseSchema,
  toGameModeResponse
} from "@/features/game-modes/http";
import type { GameMode } from "@/features/game-modes/db";
import type {
  ComposedMatch,
  ComposedMatchRound,
  Match,
  MatchPlayerStint,
  MatchTeamMetadata
} from "@/features/matches/db";
import {
  normalizeMatchScore,
  toMatchRoundReference
} from "@/features/matches/_shared/domain/composition";
import { matchRoundReferenceSchema } from "@/features/matches/resolve-logical-match";
import {
  composedMatchPublicIdSchema,
  matchFieldTeamSchema,
  matchCompletionReasonSchema,
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

export const matchSummaryPlayerResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
  team: matchFieldTeamSchema
});

export const physicalMatchSummaryResponseSchema = t.Object({
  kind: t.Literal("single"),
  id: matchPublicIdSchema,
  status: matchStatusSchema,
  completionReason: t.Optional(matchCompletionReasonSchema),
  initiatedAt: t.Nullable(t.String()),
  endedAt: t.Nullable(t.String()),
  score: t.Nullable(matchScoreSchema),
  recording: t.Nullable(recordingResponseSchema),
  gameMode: t.Nullable(gameModeResponseSchema),
  eventSchema: t.Nullable(eventSchemaReferenceSchema),
  players: t.Array(matchSummaryPlayerResponseSchema),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const physicalMatchResponseSchema = t.Intersect([
  physicalMatchSummaryResponseSchema,
  t.Object({
    events: t.Array(matchEventResponseSchema),
    participations: t.Array(matchPlayerStintResponseSchema)
  })
]);

export const matchRoundReferenceResponseSchema = matchRoundReferenceSchema;

export const matchRoundSummaryResponseSchema = t.Intersect([
  matchRoundReferenceResponseSchema,
  t.Object({
    match: physicalMatchSummaryResponseSchema
  })
]);

export const matchRoundResponseSchema = t.Intersect([
  matchRoundReferenceResponseSchema,
  t.Object({
    match: physicalMatchResponseSchema
  })
]);

export const composedMatchResponseSchema = t.Object({
  kind: t.Literal("composed"),
  id: composedMatchPublicIdSchema,
  status: matchStatusSchema,
  initiatedAt: t.Nullable(t.String()),
  endedAt: t.Nullable(t.String()),
  score: t.Nullable(matchScoreSchema),
  gameMode: t.Nullable(gameModeResponseSchema),
  eventSchema: t.Nullable(eventSchemaReferenceSchema),
  rounds: t.Array(matchRoundSummaryResponseSchema, { minItems: 2 }),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const matchSummaryResponseSchema = t.Union([
  physicalMatchSummaryResponseSchema,
  composedMatchResponseSchema
]);

export const matchResponseSchema = t.Union([
  physicalMatchResponseSchema,
  composedMatchResponseSchema
]);

export const listMatchesResponseSchema = paginatedResponseSchema(
  matchSummaryResponseSchema
);

export type PhysicalMatchSummaryResponse = Static<
  typeof physicalMatchSummaryResponseSchema
>;
export type PhysicalMatchResponse = Static<typeof physicalMatchResponseSchema>;
export type MatchRoundReferenceResponse = Static<
  typeof matchRoundReferenceResponseSchema
>;
export type MatchRoundSummaryResponse = Static<
  typeof matchRoundSummaryResponseSchema
>;
export type MatchRoundResponse = Static<typeof matchRoundResponseSchema>;
export type ComposedMatchResponse = Static<typeof composedMatchResponseSchema>;
export type MatchSummaryResponse = Static<typeof matchSummaryResponseSchema>;
export type MatchResponse = Static<typeof matchResponseSchema>;

type PlayerRow = {
  player: Player;
  account: Account | null;
};

export type MatchSummaryPlayerRow = {
  player: Player;
  team: MatchPlayerStint["team"];
};

export type MatchSummaryRow = {
  match: Match;
  recording: Recording | null;
  gameMode: GameMode | null;
  eventSchemaFamily: EventSchemaFamily | null;
  eventSchemaVersion: EventSchemaVersion | null;
  metadata: MatchTeamMetadata[];
  players: MatchSummaryPlayerRow[];
};

export type MatchDetailRow = MatchSummaryRow & {
  events: MatchEventRow[];
  stints: Array<MatchPlayerStint & PlayerRow>;
};

export type ComposedMatchRow = {
  composition: ComposedMatch;
  rounds: Array<{
    round: ComposedMatchRound;
    match: MatchSummaryRow;
  }>;
};

export function toMatchSummaryResponse({
  match,
  recording,
  gameMode,
  eventSchemaFamily,
  eventSchemaVersion,
  metadata,
  players
}: MatchSummaryRow): PhysicalMatchSummaryResponse {
  return {
    kind: "single",
    id: match.publicId,
    status: match.status,
    ...(match.completionReason
      ? { completionReason: match.completionReason }
      : {}),
    initiatedAt: match.initiatedAt,
    endedAt: match.endedAt,
    score: toMatchScore(metadata),
    recording: recording ? toRecordingResponse(recording) : null,
    gameMode: gameMode ? toGameModeResponse(gameMode) : null,
    eventSchema: toMatchEventSchemaReference({
      family: eventSchemaFamily,
      version: eventSchemaVersion
    }),
    players: toMatchSummaryPlayers(players),
    createdAt: match.createdAt,
    updatedAt: match.updatedAt
  };
}

export function toMatchResponse(row: MatchDetailRow): PhysicalMatchResponse {
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

export function toComposedMatchResponse(
  row: ComposedMatchRow
): ComposedMatchResponse {
  const firstRound = row.rounds[0];
  const lastRound = row.rounds.at(-1);

  if (!firstRound || !lastRound) {
    throw new Error("Composed matches require at least two rounds");
  }

  const first = toMatchSummaryResponse(firstRound.match);
  const last = toMatchSummaryResponse(lastRound.match);
  const updatedAt = row.rounds.reduce(
    (latest, { match }) =>
      match.match.updatedAt > latest ? match.match.updatedAt : latest,
    row.composition.updatedAt
  );
  const rounds = row.rounds.map(({ round, match }) => ({
    ...toMatchRoundReference(round, match.match.publicId),
    match: toMatchSummaryResponse(match)
  }));

  return {
    kind: "composed",
    id: row.composition.publicId,
    status: last.status,
    initiatedAt: first.initiatedAt,
    endedAt: last.endedAt,
    score: last.score
      ? normalizeMatchScore(last.score, lastRound.round.teamOrientation)
      : null,
    gameMode: first.gameMode,
    eventSchema: first.eventSchema,
    rounds,
    createdAt: first.createdAt,
    updatedAt
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

function toMatchSummaryPlayers(
  rows: MatchSummaryPlayerRow[]
): PhysicalMatchSummaryResponse["players"] {
  const playersById = new Map<
    string,
    PhysicalMatchSummaryResponse["players"][number]
  >();

  for (const row of rows) {
    playersById.set(row.player.externalId, {
      id: row.player.externalId,
      name: row.player.name,
      team: row.team
    });
  }

  return [...playersById.values()];
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
