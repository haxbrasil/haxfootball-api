import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type DbTransaction } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { gameModes } from "@/features/game-modes/db";
import { matchStatEvents } from "@/features/match-stat-events/db";
import { deriveMatchStints } from "@/features/matches/_shared/domain/stints";
import type {
  ListMatchesQuery,
  MatchPlayerEventInput,
  MatchScore
} from "@/features/matches/_shared/http/inputs";
import type { MatchDetailRow } from "@/features/matches/_shared/http/responses";
import type { MatchSummaryRow } from "@/features/matches/_shared/http/responses";
import {
  matchPlayerEvents,
  matchPlayerStints,
  matches,
  matchTeamMetadata
} from "@/features/matches/db";
import { validateMatchEvents } from "@/features/matches/_shared/domain/validation";
import { players, type Player } from "@/features/players/db";
import { recordings } from "@/features/recordings/db";
import {
  statEventSchemaFamilies,
  statEventSchemaVersions
} from "@/features/stat-event-schemas/db";
import { resolveStatEventSchemaVersion } from "@/features/stat-event-schemas/read-stat-event-schema";
import { badRequest, notFound } from "@/shared/http/errors";
import { cursorAfter, cursorSort, pageLimit } from "@lib";

export type PersistedMatchEvent = MatchPlayerEventInput & {
  sequence: number;
  player: Player;
};

type MatchPersistenceDb = typeof db | DbTransaction;

export async function listMatchSummaries(
  query: ListMatchesQuery = {}
): Promise<MatchSummaryRow[]> {
  const conditions: SQL[] = [];
  const cursorCondition = cursorAfter(matches.id, query.cursor, "desc");

  if (cursorCondition) {
    conditions.push(cursorCondition);
  }

  if (query.gameMode) {
    conditions.push(eq(gameModes.name, query.gameMode));
  }

  const rows = await db
    .select({
      match: matches,
      recording: recordings,
      gameMode: gameModes,
      statEventSchemaFamily: statEventSchemaFamilies,
      statEventSchemaVersion: statEventSchemaVersions
    })
    .from(matches)
    .leftJoin(recordings, eq(matches.recordingId, recordings.id))
    .leftJoin(gameModes, eq(matches.gameModeId, gameModes.id))
    .leftJoin(
      statEventSchemaVersions,
      eq(matches.statEventSchemaVersionId, statEventSchemaVersions.id)
    )
    .leftJoin(
      statEventSchemaFamilies,
      eq(statEventSchemaVersions.familyId, statEventSchemaFamilies.id)
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(cursorSort(matches.id, "desc"))
    .limit(pageLimit(query));

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
      gameMode: gameModes,
      statEventSchemaFamily: statEventSchemaFamilies,
      statEventSchemaVersion: statEventSchemaVersions
    })
    .from(matches)
    .leftJoin(recordings, eq(matches.recordingId, recordings.id))
    .leftJoin(gameModes, eq(matches.gameModeId, gameModes.id))
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

export async function assertMatchGameModeCanChange(
  matchId: number
): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(matchStatEvents)
    .where(eq(matchStatEvents.matchId, matchId));

  if (count > 0) {
    throw badRequest(
      "Match game mode cannot be changed after stat events exist"
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
  score: MatchScore | null | undefined,
  database: MatchPersistenceDb = db
): Promise<void> {
  await database
    .delete(matchTeamMetadata)
    .where(eq(matchTeamMetadata.matchId, matchId));

  if (!score) {
    return;
  }

  await database.insert(matchTeamMetadata).values([
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
  startSequence = 1,
  database: MatchPersistenceDb = db
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const persistedEvents = await resolveMatchEvents(events, startSequence);

  await persistResolvedMatchEvents(matchId, persistedEvents, database);
}

export async function persistResolvedMatchEvents(
  matchId: number,
  persistedEvents: PersistedMatchEvent[],
  database: MatchPersistenceDb = db
): Promise<void> {
  if (persistedEvents.length === 0) {
    return;
  }

  await database.insert(matchPlayerEvents).values(
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

export async function recomputeMatchStints(
  matchId: number,
  database: MatchPersistenceDb = db
): Promise<void> {
  const events = await listMatchEvents(matchId, database);
  const stints = deriveMatchStints(events);

  await database
    .delete(matchPlayerStints)
    .where(eq(matchPlayerStints.matchId, matchId));

  if (stints.length === 0) {
    return;
  }

  await database.insert(matchPlayerStints).values(
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

export async function resolveMatchEvents(
  events: MatchPlayerEventInput[],
  startSequence: number,
  database: MatchPersistenceDb = db
): Promise<PersistedMatchEvent[]> {
  validateMatchEvents(events);

  const externalIds = Array.from(
    new Set(events.map((event) => event.playerId))
  );

  const playerRows =
    externalIds.length > 0
      ? await database
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

export async function listMatchMetadata(matchId: number) {
  return db
    .select()
    .from(matchTeamMetadata)
    .where(eq(matchTeamMetadata.matchId, matchId));
}

async function listMatchEvents(
  matchId: number,
  database: MatchPersistenceDb = db
) {
  return database
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
      player: players,
      account: accounts
    })
    .from(matchPlayerEvents)
    .innerJoin(players, eq(matchPlayerEvents.playerId, players.id))
    .leftJoin(accounts, eq(players.accountId, accounts.id))
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
      player: players,
      account: accounts
    })
    .from(matchPlayerStints)
    .innerJoin(players, eq(matchPlayerStints.playerId, players.id))
    .leftJoin(accounts, eq(players.accountId, accounts.id))
    .where(eq(matchPlayerStints.matchId, matchId))
    .orderBy(asc(matchPlayerStints.id));
}
