import {
  type MatchSummaryResponse,
  listMatchesResponseSchema,
  toMatchSummaryResponse
} from "@/features/matches/match.contract";
import type { MatchSummaryRow } from "@/features/matches/match.contract";
import { listMatchSummaries } from "@/features/matches/match.persistence";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export { listMatchesResponseSchema };

export async function listMatches(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<MatchSummaryResponse>> {
  const rows = await listMatchSummaries(query);
  const page = pageItems(rows, query, (row: MatchSummaryRow) => row.match.id);

  return {
    items: page.items.map(toMatchSummaryResponse),
    page: page.page
  };
}
