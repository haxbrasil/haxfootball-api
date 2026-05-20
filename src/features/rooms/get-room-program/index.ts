import {
  roomProgramResponseSchema,
  toRoomProgramResponse,
  type RoomProgramResponse
} from "@/features/rooms/_shared/http/inputs";
import { getRoomProgramByUuid } from "@/features/rooms/_shared/db/queries";

export { roomProgramResponseSchema };

export async function getRoomProgram(
  uuid: string
): Promise<RoomProgramResponse> {
  return toRoomProgramResponse(await getRoomProgramByUuid(uuid));
}
