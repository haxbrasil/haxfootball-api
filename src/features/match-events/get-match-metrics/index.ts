import { type Static, t } from "elysia";
import { matchMetricsResponseSchema as physicalMatchMetricsResponseSchema } from "@/features/match-events/_shared/http/responses";
import { deriveMatchMetrics } from "@/features/match-events/_shared/domain/metrics";
import {
  getSchemaBoundMatch,
  listMatchEventsByMatchId,
  listMatchEventsByMatchIds
} from "@/features/match-events/_shared/db/queries";
import {
  matchRoundReferenceSchema,
  resolveLogicalMatch
} from "@/features/matches/resolve-logical-match";

const roundMetricsResponseSchema = t.Object({
  round: matchRoundReferenceSchema,
  metrics: physicalMatchMetricsResponseSchema
});

export const matchMetricsResponseSchema = t.Union([
  physicalMatchMetricsResponseSchema,
  t.Object({
    overall: physicalMatchMetricsResponseSchema,
    rounds: t.Array(roundMetricsResponseSchema)
  })
]);

export type LogicalMatchMetricsResponse = Static<
  typeof matchMetricsResponseSchema
>;

export async function getMatchMetrics(
  id: string
): Promise<LogicalMatchMetricsResponse> {
  const logicalMatch = await resolveLogicalMatch(id);

  if (logicalMatch.kind === "composed") {
    const { schemaVersion } = await getSchemaBoundMatch(
      logicalMatch.firstMatch.publicId
    );
    const events = await listMatchEventsByMatchIds(
      logicalMatch.rounds.map((round) => round.match.id)
    );
    const eventsByMatchId = new Map<number, typeof events>();

    for (const event of events) {
      const roundEvents = eventsByMatchId.get(event.matchId) ?? [];

      roundEvents.push(event);
      eventsByMatchId.set(event.matchId, roundEvents);
    }

    return {
      overall: deriveMatchMetrics(schemaVersion.definition, events),
      rounds: logicalMatch.rounds.map((round) => ({
        round: round.reference,
        metrics: deriveMatchMetrics(
          schemaVersion.definition,
          eventsByMatchId.get(round.match.id) ?? []
        )
      }))
    };
  }

  const { match, schemaVersion } = await getSchemaBoundMatch(
    logicalMatch.publicId
  );
  const events = await listMatchEventsByMatchId(match.id);

  return deriveMatchMetrics(schemaVersion.definition, events);
}
