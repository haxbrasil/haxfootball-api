import { asc, count, eq, inArray, sql } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db, type DatabaseExecutor } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import {
  matchEventResponseSchema,
  toMatchEventResponse
} from "@/features/match-events/http";
import { listMatchEventsByMatchId } from "@/features/match-events/_shared/db/queries";
import { matchEvents } from "@/features/match-events/db";
import {
  logicalMatchEvidenceClaimRounds,
  logicalMatchEvidenceClaims,
  recordingInspections
} from "@/features/matches/evidence-db";
import { matchPlayerStints, matchTeamMetadata } from "@/features/matches/db";
import {
  logicalMatchPublicIdSchema,
  matchCompletionReasonSchema,
  matchFieldTeamSchema,
  matchScoreSchema,
  matchStatusSchema
} from "@/features/matches/_shared/http/inputs";
import {
  normalizeMatchScore,
  type MatchScore,
  type TeamOrientation
} from "@/features/matches/_shared/domain/composition";
import { resolveLogicalMatch } from "@/features/matches/resolve-logical-match";
import {
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/responses";
import { players } from "@/features/players/db";
import {
  recordingResponseSchema,
  toRecordingResponse
} from "@/features/recordings/http";
import { recordings } from "@/features/recordings/db";
import {
  readRoomProgramProvenance,
  type RoomProgramProvenance
} from "@/features/rooms/read-room-provenance";

const sideSchema = t.Union([t.Literal("a"), t.Literal("b")]);
const orientationSchema = t.Union([t.Literal("aligned"), t.Literal("swapped")]);
const evidenceQualitySchema = t.Union([
  t.Literal("complete"),
  t.Literal("recovered"),
  t.Literal("partial"),
  t.Literal("legacy"),
  t.Literal("ineligible")
]);

export const logicalMatchEvidenceQuerySchema = t.Object({
  eventLimit: t.Optional(t.Integer({ minimum: 1, maximum: 500 })),
  participantLimit: t.Optional(t.Integer({ minimum: 1, maximum: 500 }))
});

const boundedEventsSchema = t.Object({
  items: t.Array(matchEventResponseSchema),
  totalCount: t.Integer({ minimum: 0 }),
  truncated: t.Boolean()
});

const evidenceParticipantSchema = t.Object({
  player: playerResponseSchema,
  rawTeam: matchFieldTeamSchema,
  logicalSide: sideSchema,
  playingTimeSeconds: t.Number({ minimum: 0 }),
  stintCount: t.Integer({ minimum: 1 })
});

const boundedParticipantsSchema = t.Object({
  items: t.Array(evidenceParticipantSchema),
  totalCount: t.Integer({ minimum: 0 }),
  truncated: t.Boolean()
});

const roomProgramProvenanceSchema = t.Object({
  room: t.Object({ uuid: t.String({ format: "uuid" }) }),
  championshipContextUuid: t.Nullable(t.String({ format: "uuid" })),
  program: t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String(),
    title: t.Nullable(t.String())
  }),
  version: t.Object({
    uuid: t.String({ format: "uuid" }),
    version: t.String()
  })
});

const evidenceRecordingSchema = t.Intersect([
  recordingResponseSchema,
  t.Object({
    validation: t.Union([
      t.Literal("unchecked"),
      t.Literal("playable"),
      t.Literal("invalid"),
      t.Literal("unsupported")
    ])
  })
]);

const logicalMatchEvidenceRoundSchema = t.Object({
  kind: t.Union([t.Literal("sequential"), t.Literal("extra-time")]),
  number: t.Nullable(t.Integer({ minimum: 1 })),
  position: t.Integer({ minimum: 1 }),
  matchId: t.String(),
  orientation: orientationSchema,
  status: matchStatusSchema,
  eligible: t.Boolean(),
  completionReason: t.Optional(matchCompletionReasonSchema),
  initiatedAt: t.Nullable(t.String()),
  endedAt: t.Nullable(t.String()),
  elapsedSeconds: t.Nullable(t.Number()),
  lastCheckpointAt: t.Nullable(t.String()),
  rawScore: t.Nullable(matchScoreSchema),
  normalizedScore: t.Nullable(matchScoreSchema),
  quality: evidenceQualitySchema,
  recording: t.Nullable(evidenceRecordingSchema),
  provenance: t.Nullable(roomProgramProvenanceSchema),
  participants: boundedParticipantsSchema,
  events: boundedEventsSchema
});

export const logicalMatchEvidenceResponseSchema = t.Object({
  kind: t.Union([t.Literal("single"), t.Literal("composed")]),
  id: logicalMatchPublicIdSchema,
  scoreMode: t.Union([t.Literal("cumulative"), t.Literal("per-game")]),
  status: matchStatusSchema,
  eligible: t.Boolean(),
  score: t.Nullable(matchScoreSchema),
  claim: t.Nullable(
    t.Object({
      consumerKind: t.String(),
      consumerUuid: t.String()
    })
  ),
  quality: evidenceQualitySchema,
  rounds: t.Array(logicalMatchEvidenceRoundSchema, { minItems: 1 })
});

export type LogicalMatchEvidenceQuery = Static<
  typeof logicalMatchEvidenceQuerySchema
>;
export type LogicalMatchEvidenceResponse = Static<
  typeof logicalMatchEvidenceResponseSchema
>;

export async function readLogicalMatchEvidence(
  publicId: string,
  query: LogicalMatchEvidenceQuery = {},
  database: DatabaseExecutor = db
): Promise<LogicalMatchEvidenceResponse> {
  const logicalMatch = await resolveLogicalMatch(publicId, database);
  const eventLimit = query.eventLimit ?? 100;
  const participantLimit = query.participantLimit ?? 100;
  const physicalIds = logicalMatch.rounds.map((round) => round.match.id);
  const roomInstanceIds = logicalMatch.rounds
    .map((round) => round.match.roomInstanceId)
    .filter((id): id is number => id !== null);
  const recordingIds = logicalMatch.rounds
    .map((round) => round.match.recordingId)
    .filter((id): id is number => id !== null);
  const [metadata, recordingRows, inspectionRows, provenance, claimRows] =
    await Promise.all([
      database
        .select()
        .from(matchTeamMetadata)
        .where(inArray(matchTeamMetadata.matchId, physicalIds)),
      recordingIds.length
        ? database
            .select()
            .from(recordings)
            .where(inArray(recordings.id, recordingIds))
        : [],
      recordingIds.length
        ? database
            .select()
            .from(recordingInspections)
            .where(inArray(recordingInspections.recordingId, recordingIds))
        : [],
      readRoomProgramProvenance(database, roomInstanceIds),
      database
        .select({
          physicalMatchId: logicalMatchEvidenceClaimRounds.physicalMatchId,
          consumerKind: logicalMatchEvidenceClaims.consumerKind,
          consumerUuid: logicalMatchEvidenceClaims.consumerUuid
        })
        .from(logicalMatchEvidenceClaimRounds)
        .innerJoin(
          logicalMatchEvidenceClaims,
          eq(
            logicalMatchEvidenceClaimRounds.claimId,
            logicalMatchEvidenceClaims.id
          )
        )
        .where(
          inArray(logicalMatchEvidenceClaimRounds.physicalMatchId, physicalIds)
        )
    ]);
  const metadataByMatchId = new Map<number, typeof metadata>();
  const recordingById = new Map(
    recordingRows.map((recording) => [recording.id, recording])
  );
  const inspectionByRecordingId = new Map(
    inspectionRows.map((inspection) => [inspection.recordingId, inspection])
  );

  for (const item of metadata) {
    const items = metadataByMatchId.get(item.matchId) ?? [];
    items.push(item);
    metadataByMatchId.set(item.matchId, items);
  }

  const rounds = await Promise.all(
    logicalMatch.rounds.map(async (round, index) => {
      const rawScore = scoreFromMetadata(
        metadataByMatchId.get(round.match.id) ?? []
      );
      const normalizedScore = rawScore
        ? normalizeMatchScore(rawScore, round.reference.orientation)
        : null;
      const [participants, events] = await Promise.all([
        readParticipants(
          round.match.id,
          round.match.elapsedSeconds,
          round.reference.orientation,
          participantLimit,
          database
        ),
        readEvents(round.match.id, eventLimit, database)
      ]);
      const recording = round.match.recordingId
        ? recordingById.get(round.match.recordingId)
        : null;
      const source = round.match.roomInstanceId
        ? (provenance.get(round.match.roomInstanceId) ?? null)
        : null;

      return {
        kind: round.reference.kind,
        number: round.reference.number,
        position: index + 1,
        matchId: round.match.publicId,
        orientation: round.reference.orientation,
        status: round.match.status,
        eligible: round.match.status === "completed",
        ...(round.match.completionReason
          ? { completionReason: round.match.completionReason }
          : {}),
        initiatedAt: round.match.initiatedAt,
        endedAt: round.match.endedAt,
        elapsedSeconds: round.match.elapsedSeconds,
        lastCheckpointAt: round.match.lastCheckpointAt,
        rawScore,
        normalizedScore,
        quality: roundQuality(round.match, !!recording, source),
        recording: recording
          ? {
              ...toRecordingResponse(recording),
              validation:
                inspectionByRecordingId.get(recording.id)?.state ??
                ("unchecked" as const)
            }
          : null,
        provenance: source,
        participants,
        events
      };
    })
  );
  const eligible = rounds.every((round) => round.eligible);

  return {
    kind: logicalMatch.kind,
    id: logicalMatch.publicId,
    scoreMode:
      logicalMatch.kind === "composed"
        ? logicalMatch.composition.scoreMode
        : "per-game",
    status: logicalMatch.lastMatch.status,
    eligible,
    score:
      logicalMatch.kind === "composed" &&
      logicalMatch.composition.scoreMode === "cumulative"
        ? (rounds.at(-1)?.normalizedScore ?? null)
        : sumRoundScores(rounds),
    claim: claimRows[0]
      ? {
          consumerKind: claimRows[0].consumerKind,
          consumerUuid: claimRows[0].consumerUuid
        }
      : null,
    quality: overallQuality(rounds.map((round) => round.quality)),
    rounds
  };
}

function sumRoundScores(
  rounds: Array<{ normalizedScore: MatchScore | null }>
): MatchScore | null {
  if (rounds.some((round) => round.normalizedScore === null)) {
    return null;
  }

  return rounds.reduce<MatchScore>(
    (total, round) => ({
      red: total.red + (round.normalizedScore?.red ?? 0),
      blue: total.blue + (round.normalizedScore?.blue ?? 0)
    }),
    { red: 0, blue: 0 }
  );
}

async function readEvents(
  matchId: number,
  limit: number,
  database: DatabaseExecutor
) {
  const [items, totalRows] = await Promise.all([
    listMatchEventsByMatchId(matchId, { limit: limit + 1 }, database),
    database
      .select({ value: count() })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, matchId))
  ]);
  const totalCount = totalRows[0]?.value ?? 0;

  return {
    items: items.slice(0, limit).map(toMatchEventResponse),
    totalCount,
    truncated: totalCount > limit
  };
}

async function readParticipants(
  matchId: number,
  elapsedSeconds: number | null,
  orientation: TeamOrientation,
  limit: number,
  database: DatabaseExecutor
) {
  const fallbackEnd = elapsedSeconds ?? 0;
  const [rows, totalRows] = await Promise.all([
    database
      .select({
        player: players,
        account: accounts,
        team: matchPlayerStints.team,
        playingTimeSeconds: sql<number>`sum(max(0, coalesce(${matchPlayerStints.leftElapsedSeconds}, ${fallbackEnd}) - coalesce(${matchPlayerStints.joinedElapsedSeconds}, 0)))`,
        stintCount: count(matchPlayerStints.id)
      })
      .from(matchPlayerStints)
      .innerJoin(players, eq(matchPlayerStints.playerId, players.id))
      .leftJoin(accounts, eq(players.accountId, accounts.id))
      .where(eq(matchPlayerStints.matchId, matchId))
      .groupBy(players.id, accounts.id, matchPlayerStints.team)
      .orderBy(asc(matchPlayerStints.team), asc(players.name))
      .limit(limit),
    database
      .select({
        value: sql<number>`count(distinct cast(${matchPlayerStints.playerId} as text) || ':' || ${matchPlayerStints.team})`
      })
      .from(matchPlayerStints)
      .where(eq(matchPlayerStints.matchId, matchId))
  ]);
  const totalCount = totalRows[0]?.value ?? 0;

  return {
    items: rows.map((row) => ({
      player: toPlayerResponse(row),
      rawTeam: row.team,
      logicalSide: normalizedSide(row.team, orientation),
      playingTimeSeconds: row.playingTimeSeconds,
      stintCount: row.stintCount
    })),
    totalCount,
    truncated: totalCount > rows.length
  };
}

function normalizedSide(
  team: "red" | "blue",
  orientation: TeamOrientation
): "a" | "b" {
  if (orientation === "aligned") {
    return team === "red" ? "a" : "b";
  }

  return team === "red" ? "b" : "a";
}

function scoreFromMetadata(
  metadata: Array<{ team: "red" | "blue"; score: number }>
): MatchScore | null {
  const red = metadata.find((item) => item.team === "red");
  const blue = metadata.find((item) => item.team === "blue");

  return red && blue ? { red: red.score, blue: blue.score } : null;
}

function roundQuality(
  match: Awaited<ReturnType<typeof resolveLogicalMatch>>["firstMatch"],
  hasRecording: boolean,
  provenance: RoomProgramProvenance | null
): Static<typeof evidenceQualitySchema> {
  if (match.status !== "completed") {
    return "ineligible";
  }
  if (!provenance) {
    return "legacy";
  }
  if (
    match.completionReason === "room-closed" ||
    match.completionReason === "room-process-exit"
  ) {
    return "recovered";
  }

  return hasRecording ? "complete" : "partial";
}

function overallQuality(
  qualities: Array<Static<typeof evidenceQualitySchema>>
): Static<typeof evidenceQualitySchema> {
  for (const quality of [
    "ineligible",
    "partial",
    "recovered",
    "legacy",
    "complete"
  ] as const) {
    if (qualities.includes(quality)) {
      return quality;
    }
  }

  return "ineligible";
}
