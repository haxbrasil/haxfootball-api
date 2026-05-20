import { matchStatEventInputSchema } from "@/features/match-stat-events/_shared/http/inputs";
import {
  type MatchStatEventResponse,
  toMatchStatEventResponse
} from "@/features/match-stat-events/_shared/http/responses";
import { addMatchStatEvent as persistMatchStatEvent } from "@/features/match-stat-events/_shared/db/queries";

export const addMatchStatEventBodySchema = matchStatEventInputSchema;

export async function addMatchStatEvent(
  id: string,
  input: Parameters<typeof persistMatchStatEvent>[1]
): Promise<MatchStatEventResponse> {
  return toMatchStatEventResponse(await persistMatchStatEvent(id, input));
}
