import {
  type MatchEventResponse,
  listMatchEventsResponseSchema,
  toMatchEventResponse
} from "@/features/match-events/_shared/http/responses";
import { listMatchEventRows } from "@/features/match-events/_shared/db/queries";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export { listMatchEventsResponseSchema };

export async function listMatchEvents(
  id: string,
  query: PaginationQuery = {}
): Promise<PaginatedResponse<MatchEventResponse>> {
  const rows = await listMatchEventRows(id, query);
  const page = pageItems(rows, query, (row) => row.sequence);

  return {
    items: page.items.map(toMatchEventResponse),
    page: page.page
  };
}
