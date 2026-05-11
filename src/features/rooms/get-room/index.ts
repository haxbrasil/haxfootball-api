import {
  roomResponseSchema,
  toRoomResponse,
  type RoomResponse
} from "@/features/rooms/room.contract";
import { getRoomRow } from "@/features/rooms/room.persistence";
import { reconcileOpenRooms } from "@/features/rooms/reconcile-rooms";

export { roomResponseSchema };

export async function getRoom(uuid: string): Promise<RoomResponse> {
  await reconcileOpenRooms();

  return toRoomResponse(await getRoomRow(uuid));
}
