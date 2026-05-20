import { toMatchSummaryResponse } from "@/features/matches/_shared/http/responses";
import type { MatchSummaryRow } from "@/features/matches/_shared/http/responses";
import {
  type MatchSummaryResponse,
  listMatchesResponseSchema
} from "@/features/matches/_shared/http/responses";
import { listMatchSummaries } from "@/features/matches/_shared/db/queries";
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
