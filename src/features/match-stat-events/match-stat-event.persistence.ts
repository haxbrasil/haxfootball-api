import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import type {
  MatchStatEventInput,
  MatchStatEventRow
} from "@/features/match-stat-events/match-stat-event.contract";
import { matchStatEvents } from "@/features/match-stat-events/match-stat-event.db";
import { matches } from "@/features/matches/match.db";
import { players } from "@/features/players/player.db";
import type { StatEventSchemaVersion } from "@/features/stat-event-schemas/stat-event-schema.db";
import { statEventSchemaVersions } from "@/features/stat-event-schemas/stat-event-schema.db";
import { validateStatValue } from "@/features/stat-event-schemas/stat-event-schema.service";
import { badRequest, notFound } from "@/shared/http/errors";
import {
  cursorAfter,
  cursorSort,
  isJsonValue,
  pageLimit,
  type PaginationQuery
} from "@lib";

export async function getSchemaBoundMatch(publicId: string): Promise<{
  match: typeof matches.$inferSelect;
  schemaVersion: StatEventSchemaVersion;
}> {
  const [row] = await db
    .select({
      match: matches,
      schemaVersion: statEventSchemaVersions
    })
    .from(matches)
    .innerJoin(
      statEventSchemaVersions,
      eq(matches.statEventSchemaVersionId, statEventSchemaVersions.id)
    )
    .where(eq(matches.publicId, publicId));

  if (!row) {
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.publicId, publicId));

    if (!match) {
      throw notFound("Match not found");
    }

    throw badRequest("Match does not have a stat event schema");
  }

  return row;
}

export async function addMatchStatEvent(
  publicId: string,
  input: MatchStatEventInput
): Promise<MatchStatEventRow> {
  const { match, schemaVersion } = await getSchemaBoundMatch(publicId);

  if (match.status !== "ongoing") {
    throw badRequest("Stat events can only be added to ongoing matches");
  }

  if (!isJsonValue(input.value)) {
    throw badRequest("Stat event value must be valid JSON");
  }

  const eventDefinition = schemaVersion.definition.events.find(
    (event) => event.type === input.type
  );

  if (!eventDefinition) {
    throw badRequest("Stat event type is not defined by the match schema");
  }

  if (!validateStatValue(input.value, eventDefinition.valueSchema)) {
    throw badRequest("Stat event value does not match the schema");
  }

  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.externalId, input.playerId));

  if (!player) {
    throw notFound("Player not found");
  }

  const [row] = await db
    .insert(matchStatEvents)
    .values({
      uuid: crypto.randomUUID(),
      matchId: match.id,
      schemaVersionId: schemaVersion.id,
      sequence: await nextMatchStatEventSequence(match.id),
      type: input.type,
      playerId: player.id,
      value: input.value,
      occurredAt: input.occurredAt ?? null,
      tick: input.tick ?? null
    })
    .returning();

  return {
    ...row,
    player
  };
}

export async function listMatchStatEventRows(
  publicId: string,
  query: PaginationQuery = {}
): Promise<MatchStatEventRow[]> {
  const { match } = await getSchemaBoundMatch(publicId);

  return listMatchStatEventsByMatchId(match.id, query);
}

export async function listMatchStatEventsByMatchId(
  matchId: number,
  query?: PaginationQuery
): Promise<MatchStatEventRow[]> {
  return db
    .select({
      id: matchStatEvents.id,
      uuid: matchStatEvents.uuid,
      matchId: matchStatEvents.matchId,
      schemaVersionId: matchStatEvents.schemaVersionId,
      sequence: matchStatEvents.sequence,
      type: matchStatEvents.type,
      playerId: matchStatEvents.playerId,
      value: matchStatEvents.value,
      occurredAt: matchStatEvents.occurredAt,
      tick: matchStatEvents.tick,
      disabledAt: matchStatEvents.disabledAt,
      createdAt: matchStatEvents.createdAt,
      updatedAt: matchStatEvents.updatedAt,
      player: players
    })
    .from(matchStatEvents)
    .innerJoin(players, eq(matchStatEvents.playerId, players.id))
    .where(
      and(
        eq(matchStatEvents.matchId, matchId),
        cursorAfter(matchStatEvents.sequence, query?.cursor, "asc")
      )
    )
    .orderBy(cursorSort(matchStatEvents.sequence, "asc"))
    .limit(query ? pageLimit(query) : -1);
}

export async function disableMatchStatEvent(
  publicId: string,
  eventId: string
): Promise<MatchStatEventRow> {
  const { match } = await getSchemaBoundMatch(publicId);

  if (match.status !== "completed") {
    throw badRequest("Stat events can only be disabled after match completion");
  }

  const now = new Date().toISOString();
  const [existingEvent] = await db
    .select()
    .from(matchStatEvents)
    .where(
      and(
        eq(matchStatEvents.matchId, match.id),
        eq(matchStatEvents.uuid, eventId)
      )
    );

  if (!existingEvent) {
    throw notFound("Stat event not found");
  }

  const [event] = existingEvent.disabledAt
    ? [existingEvent]
    : await db
        .update(matchStatEvents)
        .set({
          disabledAt: now,
          updatedAt: now
        })
        .where(eq(matchStatEvents.id, existingEvent.id))
        .returning();

  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.id, event.playerId));

  if (!player) {
    throw notFound("Player not found");
  }

  return {
    ...event,
    player
  };
}

async function nextMatchStatEventSequence(matchId: number): Promise<number> {
  const rows = await db
    .select({ sequence: matchStatEvents.sequence })
    .from(matchStatEvents)
    .where(eq(matchStatEvents.matchId, matchId))
    .orderBy(desc(matchStatEvents.sequence));

  return (rows[0]?.sequence ?? 0) + 1;
}
