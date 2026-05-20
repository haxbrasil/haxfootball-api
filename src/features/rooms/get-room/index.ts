import {
  roomResponseSchema,
  toRoomResponse,
  type RoomResponse
} from "@/features/rooms/_shared/http/inputs";
import { getRoomRow } from "@/features/rooms/_shared/db/queries";

export { roomResponseSchema };

export async function getRoom(uuid: string): Promise<RoomResponse> {
  return toRoomResponse(await getRoomRow(uuid));
}
