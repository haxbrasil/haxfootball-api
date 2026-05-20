import {
  listRoomsResponseSchema,
  toRoomResponse,
  type ListRoomsQuery,
  type RoomResponse
} from "@/features/rooms/_shared/http/inputs";
import type { RoomRow } from "@/features/rooms/_shared/db/queries";
import { listRoomRows } from "@/features/rooms/_shared/db/queries";
import { pageItems, type PaginatedResponse } from "@lib";

export { listRoomsResponseSchema };

export async function listRooms(
  query: ListRoomsQuery = {}
): Promise<PaginatedResponse<RoomResponse>> {
  const rows = await listRoomRows({ state: query.state, pagination: query });
  const page = pageItems(rows, query, (row: RoomRow) => row.room.id);

  return {
    items: page.items.map(toRoomResponse),
    page: page.page
  };
}
