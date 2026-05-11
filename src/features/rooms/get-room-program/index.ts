import {
  roomProgramResponseSchema,
  toRoomProgramResponse,
  type RoomProgramResponse
} from "@/features/rooms/room.contract";
import { getRoomProgramByUuid } from "@/features/rooms/room.persistence";

export { roomProgramResponseSchema };

export async function getRoomProgram(
  uuid: string
): Promise<RoomProgramResponse> {
  return toRoomProgramResponse(await getRoomProgramByUuid(uuid));
}
