import {
  type MatchSummaryResponse,
  listMatchesResponseSchema,
  toMatchSummaryResponse
} from "@/features/matches/match.contract";
import { listMatchSummaries } from "@/features/matches/match.persistence";

export { listMatchesResponseSchema };

export async function listMatches(): Promise<MatchSummaryResponse[]> {
  const rows = await listMatchSummaries();

  return rows.map(toMatchSummaryResponse);
}
