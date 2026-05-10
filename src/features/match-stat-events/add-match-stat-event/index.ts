import {
  type MatchStatEventResponse,
  matchStatEventInputSchema,
  toMatchStatEventResponse
} from "@/features/match-stat-events/match-stat-event.contract";
import { addMatchStatEvent as persistMatchStatEvent } from "@/features/match-stat-events/match-stat-event.persistence";

export const addMatchStatEventBodySchema = matchStatEventInputSchema;

export async function addMatchStatEvent(
  id: string,
  input: Parameters<typeof persistMatchStatEvent>[1]
): Promise<MatchStatEventResponse> {
  return toMatchStatEventResponse(await persistMatchStatEvent(id, input));
}
