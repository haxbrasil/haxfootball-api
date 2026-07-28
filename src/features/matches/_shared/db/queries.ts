import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
  type SQL
} from "drizzle-orm";
import { db, type DbTransaction } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { gameModes } from "@/features/game-modes/db";
import { matchEvents } from "@/features/match-events/db";
import { deriveMatchStints } from "@/features/matches/_shared/domain/stints";
import type {
  ListMatchesQuery,
  MatchEventInput,
  MatchScore
} from "@/features/matches/_shared/http/inputs";
import type {
  ComposedMatchRow,
  MatchDetailRow,
  MatchSummaryRow
} from "@/features/matches/_shared/http/responses";
import {
  composedMatchRounds,
  composedMatches,
  matchPlayerStints,
  matches,
  matchTeamMetadata,
  type MatchTeamMetadata
} from "@/features/matches/db";
import { validateMatchEvents } from "@/features/matches/_shared/domain/validation";
import { players, type Player } from "@/features/players/db";
import { recordings } from "@/features/recordings/db";
import {
  eventSchemaFamilies,
  eventSchemaVersions
} from "@/features/event-schemas/db";
import { resolveEventSchemaVersion } from "@/features/event-schemas/read-event-schema";
import { badRequest, notFound } from "@/shared/http/errors";
import { cursorAfter, cursorSort, pageLimit, type JsonValue } from "@lib";

export type PersistedMatchEvent = MatchEventInput & {
  sequence: number;
  actorPlayer: Player | null;
  subjectPlayer: Player | null;
};

export async function getComposedMatchByPublicId(publicId: string) {
  const [composition] = await db
    .select()
    .from(composedMatches)
    .where(eq(composedMatches.publicId, publicId));

  if (!composition) {
    throw notFound("Composed match not found");
  }

  return composition;
}

export async function getComposedMatchRow(
  composition: typeof composedMatches.$inferSelect
): Promise<ComposedMatchRow> {
  const [row] = await getComposedMatchRows([composition]);

  if (!row) {
    throw notFound("Composed match not found");
  }

  return row;
}

export async function getComposedMatchRows(
  compositions: Array<typeof composedMatches.$inferSelect>
): Promise<ComposedMatchRow[]> {
  if (compositions.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      compositionId: composedMatchRounds.composedMatchId,
      round: composedMatchRounds,
      match: matches,
      recording: recordings,
      gameMode: gameModes,
      eventSchemaFamily: eventSchemaFamilies,
      eventSchemaVersion: eventSchemaVersions
    })
    .from(composedMatchRounds)
    .innerJoin(matches, eq(composedMatchRounds.matchId, matches.id))
    .leftJoin(recordings, eq(matches.recordingId, recordings.id))
    .leftJoin(gameModes, eq(matches.gameModeId, gameModes.id))
    .leftJoin(
      eventSchemaVersions,
      eq(matches.eventSchemaVersionId, eventSchemaVersions.id)
    )
    .leftJoin(
      eventSchemaFamilies,
      eq(eventSchemaVersions.familyId, eventSchemaFamilies.id)
    )
    .where(
      inArray(
        composedMatchRounds.composedMatchId,
        compositions.map((composition) => composition.id)
      )
    )
    .orderBy(asc(composedMatchRounds.position));
  const metadata = await db
    .select()
    .from(matchTeamMetadata)
    .where(
      inArray(
        matchTeamMetadata.matchId,
        rows.map((row) => row.match.id)
      )
    );
  const metadataByMatchId = groupMatchMetadata(metadata);
  const roundsByCompositionId = new Map<number, ComposedMatchRow["rounds"]>();

  for (const row of rows) {
    const rounds = roundsByCompositionId.get(row.compositionId) ?? [];

    rounds.push({
      round: row.round,
      match: {
        match: row.match,
        recording: row.recording,
        gameMode: row.gameMode,
        eventSchemaFamily: row.eventSchemaFamily,
        eventSchemaVersion: row.eventSchemaVersion,
        metadata: metadataByMatchId.get(row.match.id) ?? []
      }
    });
    roundsByCompositionId.set(row.compositionId, rounds);
  }

  return compositions.map((composition) => ({
    composition,
    rounds: roundsByCompositionId.get(composition.id) ?? []
  }));
}

function groupMatchMetadata(metadata: MatchTeamMetadata[]) {
  const metadataByMatchId = new Map<number, MatchTeamMetadata[]>();

  for (const item of metadata) {
    const matchMetadata = metadataByMatchId.get(item.matchId) ?? [];

    matchMetadata.push(item);
    metadataByMatchId.set(item.matchId, matchMetadata);
  }

  return metadataByMatchId;
}

export async function listMatchSummaries(query: ListMatchesQuery = {}) {
  const conditions: SQL[] = [
    inArray(matches.status, ["ongoing", "completed"]),
    or(
      isNull(composedMatchRounds.id),
      eq(matches.id, composedMatches.firstMatchId)
    ) as SQL
  ];
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
      eventSchemaFamily: eventSchemaFamilies,
      eventSchemaVersion: eventSchemaVersions,
      composition: composedMatches
    })
    .from(matches)
    .leftJoin(composedMatchRounds, eq(matches.id, composedMatchRounds.matchId))
    .leftJoin(
      composedMatches,
      eq(composedMatchRounds.composedMatchId, composedMatches.id)
    )
    .leftJoin(recordings, eq(matches.recordingId, recordings.id))
    .leftJoin(gameModes, eq(matches.gameModeId, gameModes.id))
    .leftJoin(
      eventSchemaVersions,
      eq(matches.eventSchemaVersionId, eventSchemaVersions.id)
    )
    .leftJoin(
      eventSchemaFamilies,
      eq(eventSchemaVersions.familyId, eventSchemaFamilies.id)
    )
    .where(and(...conditions))
    .orderBy(cursorSort(matches.id, "desc"))
    .limit(pageLimit(query));
  const compositionRows = await getComposedMatchRows(
    rows.flatMap((row) => (row.composition ? [row.composition] : []))
  );
  const compositionRowById = new Map(
    compositionRows.map((row) => [row.composition.id, row])
  );

  return Promise.all(
    rows.map(async ({ composition, ...row }) =>
      composition
        ? requireComposedMatchRow(compositionRowById, composition.id)
        : {
            ...row,
            metadata: await listMatchMetadata(row.match.id)
          }
    )
  );
}

function requireComposedMatchRow(
  rows: Map<number, ComposedMatchRow>,
  compositionId: number
): ComposedMatchRow {
  const row = rows.get(compositionId);

  if (!row) {
    throw new Error("Composed match hydration is missing");
  }

  return row;
}

type MatchPersistenceDb = typeof db | DbTransaction;

export async function getMatchSummary(
  publicId: string
): Promise<MatchSummaryRow> {
  const [row] = await db
    .select({
      match: matches,
      recording: recordings,
      gameMode: gameModes,
      eventSchemaFamily: eventSchemaFamilies,
      eventSchemaVersion: eventSchemaVersions
    })
    .from(matches)
    .leftJoin(recordings, eq(matches.recordingId, recordings.id))
    .leftJoin(gameModes, eq(matches.gameModeId, gameModes.id))
    .leftJoin(
      eventSchemaVersions,
      eq(matches.eventSchemaVersionId, eventSchemaVersions.id)
    )
    .leftJoin(
      eventSchemaFamilies,
      eq(eventSchemaVersions.familyId, eventSchemaFamilies.id)
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

export async function resolveMatchEventSchemaVersionId(
  input: { id: string; version: number } | null | undefined
): Promise<number | null | undefined> {
  if (input === undefined) {
    return undefined;
  }

  if (input === null) {
    return null;
  }

  const version = await resolveEventSchemaVersion(input.id, input.version);

  return version.id;
}

export async function assertMatchEventSchemaCanChange(
  matchId: number
): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId));

  if (count > 0) {
    throw badRequest("Match event schema cannot be changed after events exist");
  }
}

export async function assertMatchGameModeCanChange(
  matchId: number
): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId));

  if (count > 0) {
    throw badRequest("Match game mode cannot be changed after events exist");
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
  events: MatchEventInput[],
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

  await database.insert(matchEvents).values(
    persistedEvents.map((event) => ({
      uuid: event.id ?? crypto.randomUUID(),
      matchId,
      schemaVersionId:
        event.domain === "game"
          ? sql`(select event_schema_version_id from matches where id = ${matchId})`
          : null,
      sequence: event.sequence,
      producerSequence: event.producerSequence ?? null,
      domain: event.domain,
      type: event.type,
      scope: event.scope,
      actorPlayerId: event.actorPlayer?.id ?? null,
      subjectPlayerId: event.subjectPlayer?.id ?? null,
      team: event.team ?? null,
      roomPlayerId: event.roomPlayerId ?? null,
      playId: event.playId ?? null,
      sourceState: event.sourceState ?? null,
      value: event.value as JsonValue,
      occurredAt: event.occurredAt ?? null,
      elapsedSeconds: event.elapsedSeconds ?? null,
      tick: event.tick ?? null
    }))
  );
}

export async function replaceMatchEvents(
  matchId: number,
  events: MatchEventInput[]
): Promise<void> {
  await db.delete(matchEvents).where(eq(matchEvents.matchId, matchId));
  await persistMatchEvents(matchId, events);
}

export async function nextMatchEventSequence(matchId: number): Promise<number> {
  const rows = await db
    .select({ sequence: matchEvents.sequence })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(desc(matchEvents.sequence));

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
  events: MatchEventInput[],
  startSequence: number,
  database: MatchPersistenceDb = db
): Promise<PersistedMatchEvent[]> {
  validateMatchEvents(events);

  const externalIds = Array.from(
    new Set(
      events
        .flatMap((event) => [event.actorPlayerId, event.subjectPlayerId])
        .filter((id): id is string => !!id)
    )
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
    return {
      ...event,
      sequence: startSequence + index,
      actorPlayer: event.actorPlayerId
        ? (playerByExternalId.get(event.actorPlayerId) ?? null)
        : null,
      subjectPlayer: event.subjectPlayerId
        ? (playerByExternalId.get(event.subjectPlayerId) ?? null)
        : null
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
  const events = await database
    .select()
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.sequence));
  const playerIds = Array.from(
    new Set(
      events
        .flatMap((event) => [event.actorPlayerId, event.subjectPlayerId])
        .filter((id): id is number => id !== null)
    )
  );
  const playerRows =
    playerIds.length > 0
      ? await database
          .select({
            player: players,
            account: accounts
          })
          .from(players)
          .leftJoin(accounts, eq(players.accountId, accounts.id))
          .where(inArray(players.id, playerIds))
      : [];
  const playerById = new Map(playerRows.map((row) => [row.player.id, row]));

  return events.map((event) => {
    const actor = event.actorPlayerId
      ? playerById.get(event.actorPlayerId)
      : null;
    const subject = event.subjectPlayerId
      ? playerById.get(event.subjectPlayerId)
      : null;

    return {
      ...event,
      actorPlayer: actor?.player ?? null,
      actorAccount: actor?.account ?? null,
      subjectPlayer: subject?.player ?? null,
      subjectAccount: subject?.account ?? null
    };
  });
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
