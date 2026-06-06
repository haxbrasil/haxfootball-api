import {
  listRoomInstanceEventsResponseSchema,
  toRoomInstanceEventResponse,
  type RoomInstanceEventResponse
} from "@/features/rooms/_shared/http/inputs";
import { listRoomInstanceEventRows } from "@/features/rooms/_shared/db/queries";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export const listRoomEventsResponseSchema =
  listRoomInstanceEventsResponseSchema;

export async function listRoomEvents(
  id: string,
  query: PaginationQuery = {}
): Promise<PaginatedResponse<RoomInstanceEventResponse>> {
  const rows = await listRoomInstanceEventRows(id, query);
  const page = pageItems(rows, query, (row) => row.sequence);

  return {
    items: page.items.map(toRoomInstanceEventResponse),
    page: page.page
  };
}
