import { type Static, t } from "elysia";
import { matchEventInputSchema } from "@/features/matches/_shared/http/inputs";
import type { MatchResponse } from "@/features/matches/_shared/http/responses";
import { toMatchResponse } from "@/features/matches/_shared/http/responses";
import {
  getMatchDetail,
  getMatchSummary,
  nextMatchEventSequence,
  persistMatchEvents,
  recomputeMatchStints
} from "@/features/matches/_shared/db/queries";
import { assertMatchIsEditable } from "@/features/matches/_shared/domain/validation";

export const appendMatchEventsBodySchema = t.Object({
  events: t.Array(matchEventInputSchema, { minItems: 1 })
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
