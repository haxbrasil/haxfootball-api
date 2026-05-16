import {
  roomResponseSchema,
  toRoomResponse,
  type RoomResponse
} from "@/features/rooms/room.contract";
import { getRoomRow } from "@/features/rooms/room.persistence";

export { roomResponseSchema };

export async function getRoom(uuid: string): Promise<RoomResponse> {
  return toRoomResponse(await getRoomRow(uuid));
}
