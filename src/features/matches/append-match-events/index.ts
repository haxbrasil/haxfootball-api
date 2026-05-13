import { type Static, t } from "elysia";
import {
  type MatchResponse,
  matchPlayerEventInputSchema,
  toMatchResponse
} from "@/features/matches/match.contract";
import {
  getMatchDetail,
  getMatchSummary,
  nextMatchEventSequence,
  persistMatchEvents,
  recomputeMatchStints
} from "@/features/matches/match.persistence";
import { assertMatchIsEditable } from "@/features/matches/match.service";

export const appendMatchEventsBodySchema = t.Object({
  events: t.Array(matchPlayerEventInputSchema, { minItems: 1 })
});

export type AppendMatchEventsInput = Static<typeof appendMatchEventsBodySchema>;

export async function appendMatchEvents(
  id: string,
  input: AppendMatchEventsInput
): Promise<MatchResponse> {
  const current = await getMatchSummary(id);

  assertMatchIsEditable(current.match);

  await persistMatchEvents(
    current.match.id,
    input.events,
    await nextMatchEventSequence(current.match.id)
  );
  await recomputeMatchStints(current.match.id);

  return toMatchResponse(await getMatchDetail(id));
}
