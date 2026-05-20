import {
  type MatchMetricsResponse,
  matchMetricsResponseSchema
} from "@/features/match-stat-events/_shared/http/responses";
import { deriveMatchMetrics } from "@/features/match-stat-events/_shared/domain/metrics";
import {
  getSchemaBoundMatch,
  listMatchStatEventsByMatchId
} from "@/features/match-stat-events/_shared/db/queries";

export { matchMetricsResponseSchema };

export async function getMatchMetrics(
  id: string
): Promise<MatchMetricsResponse> {
  const { match, schemaVersion } = await getSchemaBoundMatch(id);
  const events = await listMatchStatEventsByMatchId(match.id);

  return deriveMatchMetrics(schemaVersion.definition, events);
}
