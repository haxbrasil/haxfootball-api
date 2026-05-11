import {
  listRoomsResponseSchema,
  toRoomResponse,
  type ListRoomsQuery,
  type RoomResponse
} from "@/features/rooms/room.contract";
import { listRoomRows } from "@/features/rooms/room.persistence";
import { reconcileOpenRooms } from "@/features/rooms/reconcile-rooms";

export { listRoomsResponseSchema };

export async function listRooms(
  query: ListRoomsQuery = {}
): Promise<RoomResponse[]> {
  await reconcileOpenRooms();

  const rows = await listRoomRows({ state: query.state });

  return rows.map(toRoomResponse);
}
