import { t } from "elysia";
import type { Static } from "elysia";
import {
  listMatchEventsResponseSchema as physicalListMatchEventsResponseSchema,
  matchEventResponseSchema,
  toMatchEventResponse
} from "@/features/match-events/_shared/http/responses";
import {
  listComposedMatchEventRows,
  listMatchEventRows
} from "@/features/match-events/_shared/db/queries";
import {
  matchRoundReferenceSchema,
  resolveLogicalMatch
} from "@/features/matches/resolve-logical-match";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  paginatedResponseSchema,
  type PaginationQuery
} from "@lib";

const composedMatchEventResponseSchema = t.Object({
  round: matchRoundReferenceSchema,
  event: matchEventResponseSchema
});

export const listMatchEventsResponseSchema = t.Union([
  physicalListMatchEventsResponseSchema,
  paginatedResponseSchema(composedMatchEventResponseSchema)
]);

export type ListMatchEventsResponse = Static<
  typeof listMatchEventsResponseSchema
>;

export async function listMatchEvents(
  id: string,
  query: PaginationQuery = {}
): Promise<ListMatchEventsResponse> {
  const logicalMatch = await resolveLogicalMatch(id);

  if (logicalMatch.kind === "composed") {
    const cursor = decodeCursor<{ position: number; sequence: number }>(
      query.cursor
    );
    const composedRows = await listComposedMatchEventRows(
      logicalMatch.composition.id,
      cursor,
      pageLimit(query)
    );
    const roundByPosition = new Map(
      logicalMatch.rounds.map((round, index) => [index + 1, round.reference])
    );
    const page = pageItems(composedRows, query, (row) => ({
      position: row.position,
      sequence: row.event.sequence
    }));

    return {
      items: page.items.map((row) => {
        const round = roundByPosition.get(row.position);

        if (!round) {
          throw new Error("Composed match event has no matching round");
        }

        return { round, event: toMatchEventResponse(row.event) };
      }),
      page: page.page
    };
  }

  const rows = await listMatchEventRows(logicalMatch.publicId, query);
  const page = pageItems(rows, query, (row) => row.sequence);

  return {
    items: page.items.map(toMatchEventResponse),
    page: page.page
  };
}
