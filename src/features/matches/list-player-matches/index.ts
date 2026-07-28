import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  type MatchSummaryRow,
  type MatchSummaryResponse,
  listMatchesResponseSchema,
  toComposedMatchResponse,
  toMatchSummaryResponse
} from "@/features/matches/_shared/http/responses";
import { gameModes } from "@/features/game-modes/db";
import {
  composedMatchRounds,
  composedMatches,
  matchPlayerStints,
  matches
} from "@/features/matches/db";
import {
  getComposedMatchRows,
  listMatchMetadata
} from "@/features/matches/_shared/db/queries";
import { players } from "@/features/players/db";
import { recordings } from "@/features/recordings/db";
import {
  eventSchemaFamilies,
  eventSchemaVersions
} from "@/features/event-schemas/db";
import { notFound } from "@/shared/http/errors";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export { listMatchesResponseSchema as listPlayerMatchesResponseSchema };

export async function listPlayerMatches(
  externalId: string,
  query: PaginationQuery = {}
): Promise<PaginatedResponse<MatchSummaryResponse>> {
  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.externalId, externalId));

  if (!player) {
    throw notFound("Player not found");
  }

  const logicalAnchorId = sql<number>`coalesce(${composedMatches.firstMatchId}, ${matches.id})`;
  const cursor = decodeCursor<number>(query.cursor);

  const rows = await db
    .select({
      match: matches,
      recording: recordings,
      gameMode: gameModes,
      eventSchemaFamily: eventSchemaFamilies,
      eventSchemaVersion: eventSchemaVersions,
      composition: composedMatches,
      logicalAnchorId
    })
    .from(matches)
    .innerJoin(matchPlayerStints, eq(matchPlayerStints.matchId, matches.id))
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
    .where(
      and(
        eq(matchPlayerStints.playerId, player.id),
        inArray(matches.status, ["ongoing", "completed"]),
        cursor === undefined ? undefined : lt(logicalAnchorId, cursor)
      )
    )
    .groupBy(logicalAnchorId)
    .orderBy(desc(logicalAnchorId))
    .limit(pageLimit(query));
  const composedRows = await getComposedMatchRows(
    rows.flatMap((row) => (row.composition ? [row.composition] : []))
  );
  const composedRowById = new Map(
    composedRows.map((row) => [row.composition.id, row])
  );

  const logicalRows = await Promise.all(
    rows.map(async ({ composition, logicalAnchorId: cursorId, ...row }) => ({
      cursorId,
      value: composition
        ? requireComposedRow(composedRowById, composition.id)
        : ({
            ...row,
            metadata: await listMatchMetadata(row.match.id)
          } satisfies MatchSummaryRow)
    }))
  );
  const page = pageItems(logicalRows, query, (row) => row.cursorId);

  return {
    items: page.items.map(({ value }) =>
      "composition" in value
        ? toComposedMatchResponse(value)
        : toMatchSummaryResponse(value)
    ),
    page: page.page
  };
}

function requireComposedRow<T>(rows: Map<number, T>, id: number): T {
  const row = rows.get(id);

  if (!row) {
    throw new Error("Composed player match hydration is missing");
  }

  return row;
}
