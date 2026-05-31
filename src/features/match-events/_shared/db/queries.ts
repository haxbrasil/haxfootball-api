import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { validateNativeRoomEvent } from "@/features/match-events/_shared/domain/native-room-events";
import type { MatchEventInput } from "@/features/match-events/_shared/http/inputs";
import type { MatchEventRow } from "@/features/match-events/_shared/http/responses";
import { matchEvents, type MatchEvent } from "@/features/match-events/db";
import {
  getMatchSummary,
  persistMatchEvents,
  recomputeMatchStints
} from "@/features/matches/_shared/db/queries";
import { matches } from "@/features/matches/db";
import { players } from "@/features/players/db";
import type { EventSchemaVersion } from "@/features/event-schemas/db";
import { eventSchemaVersions } from "@/features/event-schemas/db";
import { validateEventValue } from "@/features/event-schemas/definition";
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
  schemaVersion: EventSchemaVersion;
}> {
  const [row] = await db
    .select({
      match: matches,
      schemaVersion: eventSchemaVersions
    })
    .from(matches)
    .innerJoin(
      eventSchemaVersions,
      eq(matches.eventSchemaVersionId, eventSchemaVersions.id)
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

    throw badRequest("Match does not have an event schema");
  }

  return row;
}

export async function addMatchEvent(
  publicId: string,
  input: MatchEventInput
): Promise<MatchEventRow> {
  const current = await getMatchSummary(publicId);
  const { match } = current;

  if (match.status !== "ongoing") {
    throw badRequest("Events can only be added to ongoing matches");
  }

  validateInputShape(input);

  if (!isJsonValue(input.value)) {
    throw badRequest("Event value must be valid JSON");
  }

  if (input.domain === "game") {
    const schemaVersion = current.eventSchemaVersion;

    if (!schemaVersion) {
      throw badRequest("Match does not have an event schema");
    }

    const eventDefinition = schemaVersion.definition.events.find(
      (event) => event.type === input.type
    );

    if (!eventDefinition) {
      throw badRequest("Event type is not defined by the match schema");
    }

    if (!validateEventValue(input.value, eventDefinition.valueSchema)) {
      throw badRequest("Event value does not match the schema");
    }
  }

  const sequence = await nextMatchEventSequence(match.id);

  await persistMatchEvents(match.id, [input], sequence);

  if (input.domain === "room") {
    await recomputeMatchStints(match.id);
  }

  const event = (await listMatchEventsByMatchId(match.id)).find(
    (row) => row.sequence === sequence
  );

  if (!event) {
    throw notFound("Event not found");
  }

  return event;
}

export async function listMatchEventRows(
  publicId: string,
  query: PaginationQuery = {}
): Promise<MatchEventRow[]> {
  const { match } = await getSchemaBoundMatch(publicId);

  return listMatchEventsByMatchId(match.id, query);
}

export async function listMatchEventsByMatchId(
  matchId: number,
  query?: PaginationQuery
): Promise<MatchEventRow[]> {
  const rows = await db
    .select()
    .from(matchEvents)
    .where(
      and(
        eq(matchEvents.matchId, matchId),
        cursorAfter(matchEvents.sequence, query?.cursor, "asc")
      )
    )
    .orderBy(cursorSort(matchEvents.sequence, "asc"))
    .limit(query ? pageLimit(query) : -1);

  return hydrateMatchEvents(rows);
}

export async function disableMatchEvent(
  publicId: string,
  eventId: string
): Promise<MatchEventRow> {
  const { match } = await getSchemaBoundMatch(publicId);

  if (match.status !== "completed") {
    throw badRequest("Events can only be disabled after match completion");
  }

  const now = new Date().toISOString();
  const [existingEvent] = await db
    .select()
    .from(matchEvents)
    .where(
      and(eq(matchEvents.matchId, match.id), eq(matchEvents.uuid, eventId))
    );

  if (!existingEvent) {
    throw notFound("Event not found");
  }

  const [event] = existingEvent.disabledAt
    ? [existingEvent]
    : await db
        .update(matchEvents)
        .set({
          disabledAt: now,
          updatedAt: now
        })
        .where(eq(matchEvents.id, existingEvent.id))
        .returning();

  return hydrateMatchEvent(event);
}

async function nextMatchEventSequence(matchId: number): Promise<number> {
  const rows = await db
    .select({ sequence: matchEvents.sequence })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(desc(matchEvents.sequence));

  return (rows[0]?.sequence ?? 0) + 1;
}

function validateInputShape(input: MatchEventInput): void {
  if (
    input.scope === "player" &&
    !input.actorPlayerId &&
    !input.subjectPlayerId
  ) {
    throw badRequest(
      "Player-scoped events require actorPlayerId or subjectPlayerId"
    );
  }

  if (input.scope === "team" && !input.team) {
    throw badRequest("Team-scoped events require team");
  }

  validateNativeRoomEvent(input);
}

async function hydrateMatchEvent(event: MatchEvent): Promise<MatchEventRow> {
  return (await hydrateMatchEvents([event]))[0] as MatchEventRow;
}

async function hydrateMatchEvents(
  events: MatchEvent[]
): Promise<MatchEventRow[]> {
  const playerIds = Array.from(
    new Set(
      events
        .flatMap((event) => [event.actorPlayerId, event.subjectPlayerId])
        .filter((id): id is number => id !== null)
    )
  );

  const rows =
    playerIds.length > 0
      ? await db
          .select({
            player: players,
            account: accounts
          })
          .from(players)
          .leftJoin(accounts, eq(players.accountId, accounts.id))
          .where(inArray(players.id, playerIds))
      : [];

  const playerById = new Map(rows.map((row) => [row.player.id, row]));

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
