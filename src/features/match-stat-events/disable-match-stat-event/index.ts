import {
  type MatchStatEventResponse,
  matchStatEventResponseSchema,
  toMatchStatEventResponse
} from "@/features/match-stat-events/match-stat-event.contract";
import { disableMatchStatEvent as persistDisabledMatchStatEvent } from "@/features/match-stat-events/match-stat-event.persistence";
import { t } from "elysia";

export const disableMatchStatEventBodySchema = t.Object({
  disabled: t.Literal(true)
});

export { matchStatEventResponseSchema as disableMatchStatEventResponseSchema };

export async function disableMatchStatEvent(
  id: string,
  eventId: string
): Promise<MatchStatEventResponse> {
  return toMatchStatEventResponse(
    await persistDisabledMatchStatEvent(id, eventId)
  );
}
