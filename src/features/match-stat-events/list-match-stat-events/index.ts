import {
  type MatchStatEventResponse,
  listMatchStatEventsResponseSchema,
  toMatchStatEventResponse
} from "@/features/match-stat-events/match-stat-event.contract";
import { listMatchStatEventRows } from "@/features/match-stat-events/match-stat-event.persistence";

export { listMatchStatEventsResponseSchema };

export async function listMatchStatEvents(
  id: string
): Promise<MatchStatEventResponse[]> {
  const rows = await listMatchStatEventRows(id);

  return rows.map(toMatchStatEventResponse);
}
