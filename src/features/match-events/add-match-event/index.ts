import { matchEventInputSchema } from "@/features/match-events/_shared/http/inputs";
import {
  type MatchEventResponse,
  toMatchEventResponse
} from "@/features/match-events/_shared/http/responses";
import { addMatchEvent as persistMatchEvent } from "@/features/match-events/_shared/db/queries";

export const addMatchEventBodySchema = matchEventInputSchema;

export async function addMatchEvent(
  id: string,
  input: Parameters<typeof persistMatchEvent>[1]
): Promise<MatchEventResponse> {
  return toMatchEventResponse(await persistMatchEvent(id, input));
}
