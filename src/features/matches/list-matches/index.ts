import {
  type MatchSummaryResponse,
  listMatchesResponseSchema,
  toComposedMatchResponse,
  toMatchSummaryResponse
} from "@/features/matches/_shared/http/responses";
import type { ListMatchesQuery } from "@/features/matches/_shared/http/inputs";
import { listMatchSummaries } from "@/features/matches/_shared/db/queries";
import { pageItems, type PaginatedResponse } from "@lib";

export { listMatchesResponseSchema };

export async function listMatches(
  query: ListMatchesQuery = {}
): Promise<PaginatedResponse<MatchSummaryResponse>> {
  const rows = await listMatchSummaries(query);
  const page = pageItems(rows, query, (row) =>
    "composition" in row ? row.composition.firstMatchId : row.match.id
  );

  return {
    items: page.items.map((row) =>
      "composition" in row
        ? toComposedMatchResponse(row)
        : toMatchSummaryResponse(row)
    ),
    page: page.page
  };
}
