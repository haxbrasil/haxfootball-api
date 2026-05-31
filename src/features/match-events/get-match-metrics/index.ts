import {
  type MatchMetricsResponse,
  matchMetricsResponseSchema
} from "@/features/match-events/_shared/http/responses";
import { deriveMatchMetrics } from "@/features/match-events/_shared/domain/metrics";
import {
  getSchemaBoundMatch,
  listMatchEventsByMatchId
} from "@/features/match-events/_shared/db/queries";

export { matchMetricsResponseSchema };

export async function getMatchMetrics(
  id: string
): Promise<MatchMetricsResponse> {
  const { match, schemaVersion } = await getSchemaBoundMatch(id);
  const events = await listMatchEventsByMatchId(match.id);

  return deriveMatchMetrics(schemaVersion.definition, events);
}
