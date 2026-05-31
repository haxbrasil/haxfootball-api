import {
  type MatchEventResponse,
  matchEventResponseSchema,
  toMatchEventResponse
} from "@/features/match-events/_shared/http/responses";
import { disableMatchEvent as persistDisabledMatchEvent } from "@/features/match-events/_shared/db/queries";
import { t } from "elysia";

export const disableMatchEventBodySchema = t.Object({
  disabled: t.Literal(true)
});

export { matchEventResponseSchema as disableMatchEventResponseSchema };

export async function disableMatchEvent(
  id: string,
  eventId: string
): Promise<MatchEventResponse> {
  return toMatchEventResponse(await persistDisabledMatchEvent(id, eventId));
}
