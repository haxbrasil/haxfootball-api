import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { matchStatEvents } from "@/features/match-stat-events/match-stat-event.db";
import { deriveMatchStints } from "@/features/matches/match-stints.service";
import type {
  MatchDetailRow,
  MatchPlayerEventInput,
  MatchScore,
  MatchSummaryRow
} from "@/features/matches/match.contract";
import {
  matchPlayerEvents,
  matchPlayerStints,
  matches,
  matchTeamMetadata
} from "@/features/matches/match.db";
import { validateMatchEvents } from "@/features/matches/match.service";
import { players, type Player } from "@/features/players/player.db";
import { recordings } from "@/features/recordings/recording.db";
import {
  statEventSchemaFamilies,
  statEventSchemaVersions
} from "@/features/stat-event-schemas/stat-event-schema.db";
import { resolveStatEventSchemaVersion } from "@/features/stat-event-schemas/stat-event-schema.persistence";
import { badRequest, notFound } from "@/shared/http/errors";

export type PersistedMatchEvent = MatchPlayerEventInput & {
  sequence: number;
  player: Player;
};

export async function listMatchSummaries(): Promise<MatchSummaryRow[]> {
  const rows = await db
    .select({
      match: matches,
      recording: recordings,
      statEventSchemaFamily: statEventSchemaFamilies,
      statEventSchemaVersion: statEventSchemaVersions
    })
    .from(matches)
    .leftJoin(recordings, eq(matches.recordingId, recordings.id))
    .leftJoin(
      statEventSchemaVersions,
      eq(matches.statEventSchemaVersionId, statEventSchemaVersions.id)
    )
    .leftJoin(
      statEventSchemaFamilies,
      eq(statEventSchemaVersions.familyId, statEventSchemaFamilies.id)
    )
    .orderBy(desc(matches.createdAt));

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      metadata: await listMatchMetadata(row.match.id)
    }))
  );
}

export async function getMatchSummary(
  publicId: string
): Promise<MatchSummaryRow> {
  const [row] = await db
    .select({
      match: matches,
      recording: recordings,
      statEventSchemaFamily: statEventSchemaFamilies,
      statEventSchemaVersion: statEventSchemaVersions
    })
    .from(matches)
    .leftJoin(recordings, eq(matches.recordingId, recordings.id))
    .leftJoin(
      statEventSchemaVersions,
      eq(matches.statEventSchemaVersionId, statEventSchemaVersions.id)
    )
    .leftJoin(
      statEventSchemaFamilies,
      eq(statEventSchemaVersions.familyId, statEventSchemaFamilies.id)
    )
    .where(eq(matches.publicId, publicId));

  if (!row) {
    throw notFound("Match not found");
  }

  return {
    ...row,
    metadata: await listMatchMetadata(row.match.id)
  };
}

export async function resolveMatchStatEventSchemaVersionId(
  input: { id: string; version: number } | null | undefined
): Promise<number | null | undefined> {
  if (input === undefined) {
    return undefined;
  }

  if (input === null) {
    return null;
  }

  const version = await resolveStatEventSchemaVersion(input.id, input.version);

  return version.id;
}

export async function assertMatchStatEventSchemaCanChange(
  matchId: number
): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(matchStatEvents)
    .where(eq(matchStatEvents.matchId, matchId));

  if (count > 0) {
    throw badRequest(
      "Match stat event schema cannot be changed after stat events exist"
    );
  }
}

export async function getMatchDetail(
  publicId: string
): Promise<MatchDetailRow> {
  const summary = await getMatchSummary(publicId);

  return {
    ...summary,
    events: await listMatchEvents(summary.match.id),
    stints: await listMatchStints(summary.match.id)
  };
}

export async function getRecordingForAssociation(publicId: string) {
  const [recording] = await db
    .select()
    .from(recordings)
    .where(eq(recordings.publicId, publicId));

  if (!recording) {
    throw notFound("Recording not found");
  }

  const [existingMatch] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.recordingId, recording.id));

  if (existingMatch) {
    throw badRequest("Recording is already associated with a match");
  }

  return recording;
}

export async function persistMatchScore(
  matchId: number,
  score: MatchScore | null | undefined
): Promise<void> {
  await db
    .delete(matchTeamMetadata)
    .where(eq(matchTeamMetadata.matchId, matchId));

  if (!score) {
    return;
  }

  await db.insert(matchTeamMetadata).values([
    {
      matchId,
      team: "red",
      score: score.red
    },
    {
      matchId,
      team: "blue",
      score: score.blue
    }
  ]);
}

export async function persistMatchEvents(
  matchId: number,
  events: MatchPlayerEventInput[],
  startSequence = 1
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const persistedEvents = await resolveMatchEvents(events, startSequence);

  await db.insert(matchPlayerEvents).values(
    persistedEvents.map((event) => ({
      matchId,
      sequence: event.sequence,
      type: event.type,
      playerId: event.player.id,
      team: event.team ?? null,
      roomPlayerId: event.roomPlayerId ?? null,
      occurredAt: event.occurredAt ?? null,
      elapsedSeconds: event.elapsedSeconds ?? null
    }))
  );
}

export async function replaceMatchEvents(
  matchId: number,
  events: MatchPlayerEventInput[]
): Promise<void> {
  await db
    .delete(matchPlayerEvents)
    .where(eq(matchPlayerEvents.matchId, matchId));
  await persistMatchEvents(matchId, events);
}

export async function nextMatchEventSequence(matchId: number): Promise<number> {
  const rows = await db
    .select({ sequence: matchPlayerEvents.sequence })
    .from(matchPlayerEvents)
    .where(eq(matchPlayerEvents.matchId, matchId))
    .orderBy(desc(matchPlayerEvents.sequence));

  return (rows[0]?.sequence ?? 0) + 1;
}

export async function recomputeMatchStints(matchId: number): Promise<void> {
  const events = await listMatchEvents(matchId);
  const stints = deriveMatchStints(events);

  await db
    .delete(matchPlayerStints)
    .where(eq(matchPlayerStints.matchId, matchId));

  if (stints.length === 0) {
    return;
  }

  await db.insert(matchPlayerStints).values(
    stints.map((stint) => ({
      matchId,
      playerId: stint.playerId,
      team: stint.team,
      roomPlayerId: stint.roomPlayerId,
      joinedAt: stint.joinedAt,
      leftAt: stint.leftAt,
      joinedElapsedSeconds: stint.joinedElapsedSeconds,
      leftElapsedSeconds: stint.leftElapsedSeconds
    }))
  );
}

async function resolveMatchEvents(
  events: MatchPlayerEventInput[],
  startSequence: number
): Promise<PersistedMatchEvent[]> {
  validateMatchEvents(events);

  const externalIds = Array.from(
    new Set(events.map((event) => event.playerId))
  );

  const playerRows =
    externalIds.length > 0
      ? await db
          .select()
          .from(players)
          .where(inArray(players.externalId, externalIds))
      : [];

  const playerByExternalId = new Map(
    playerRows.map((player) => [player.externalId, player])
  );

  const missingExternalId = externalIds.find(
    (externalId) => !playerByExternalId.has(externalId)
  );

  if (missingExternalId) {
    throw notFound("Player not found");
  }

  return events.map((event, index) => {
    const player = playerByExternalId.get(event.playerId);

    if (!player) {
      throw notFound("Player not found");
    }

    return {
      ...event,
      sequence: startSequence + index,
      player
    };
  });
}

async function listMatchMetadata(matchId: number) {
  return db
    .select()
    .from(matchTeamMetadata)
    .where(eq(matchTeamMetadata.matchId, matchId));
}

async function listMatchEvents(matchId: number) {
  return db
    .select({
      id: matchPlayerEvents.id,
      matchId: matchPlayerEvents.matchId,
      sequence: matchPlayerEvents.sequence,
      type: matchPlayerEvents.type,
      playerId: matchPlayerEvents.playerId,
      team: matchPlayerEvents.team,
      roomPlayerId: matchPlayerEvents.roomPlayerId,
      occurredAt: matchPlayerEvents.occurredAt,
      elapsedSeconds: matchPlayerEvents.elapsedSeconds,
      createdAt: matchPlayerEvents.createdAt,
      player: players
    })
    .from(matchPlayerEvents)
    .innerJoin(players, eq(matchPlayerEvents.playerId, players.id))
    .where(eq(matchPlayerEvents.matchId, matchId))
    .orderBy(asc(matchPlayerEvents.sequence));
}

async function listMatchStints(matchId: number) {
  return db
    .select({
      id: matchPlayerStints.id,
      matchId: matchPlayerStints.matchId,
      playerId: matchPlayerStints.playerId,
      team: matchPlayerStints.team,
      roomPlayerId: matchPlayerStints.roomPlayerId,
      joinedAt: matchPlayerStints.joinedAt,
      leftAt: matchPlayerStints.leftAt,
      joinedElapsedSeconds: matchPlayerStints.joinedElapsedSeconds,
      leftElapsedSeconds: matchPlayerStints.leftElapsedSeconds,
      createdAt: matchPlayerStints.createdAt,
      player: players
    })
    .from(matchPlayerStints)
    .innerJoin(players, eq(matchPlayerStints.playerId, players.id))
    .where(eq(matchPlayerStints.matchId, matchId))
    .orderBy(asc(matchPlayerStints.id));
}
