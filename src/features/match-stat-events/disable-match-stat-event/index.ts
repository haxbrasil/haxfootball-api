import {
  type MatchStatEventResponse,
  matchStatEventResponseSchema,
  toMatchStatEventResponse
} from "@/features/match-stat-events/_shared/http/responses";
import { disableMatchStatEvent as persistDisabledMatchStatEvent } from "@/features/match-stat-events/_shared/db/queries";
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
