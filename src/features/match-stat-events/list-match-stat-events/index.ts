import {
  type MatchStatEventResponse,
  listMatchStatEventsResponseSchema,
  toMatchStatEventResponse
} from "@/features/match-stat-events/match-stat-event.contract";
import { listMatchStatEventRows } from "@/features/match-stat-events/match-stat-event.persistence";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export { listMatchStatEventsResponseSchema };

export async function listMatchStatEvents(
  id: string,
  query: PaginationQuery = {}
): Promise<PaginatedResponse<MatchStatEventResponse>> {
  const rows = await listMatchStatEventRows(id, query);
  const page = pageItems(rows, query, (row) => row.sequence);

  return {
    items: page.items.map(toMatchStatEventResponse),
    page: page.page
  };
}
