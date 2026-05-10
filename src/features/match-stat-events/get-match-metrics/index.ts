import {
  type MatchMetricsResponse,
  matchMetricsResponseSchema
} from "@/features/match-stat-events/match-stat-event.contract";
import { deriveMatchMetrics } from "@/features/match-stat-events/match-metrics.service";
import {
  getSchemaBoundMatch,
  listMatchStatEventsByMatchId
} from "@/features/match-stat-events/match-stat-event.persistence";

export { matchMetricsResponseSchema };

export async function getMatchMetrics(id: string): Promise<MatchMetricsResponse> {
  const { match, schemaVersion } = await getSchemaBoundMatch(id);
  const events = await listMatchStatEventsByMatchId(match.id);

  return deriveMatchMetrics(schemaVersion.definition, events);
}
