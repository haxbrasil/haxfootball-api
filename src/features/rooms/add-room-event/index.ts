import {
  roomInstanceEventInputSchema,
  roomInstanceEventResponseSchema,
  toRoomInstanceEventResponse,
  type RoomInstanceEventInput,
  type RoomInstanceEventResponse
} from "@/features/rooms/_shared/http/inputs";
import { addRoomInstanceEvent } from "@/features/rooms/_shared/db/queries";

export const addRoomEventBodySchema = roomInstanceEventInputSchema;
export const addRoomEventResponseSchema = roomInstanceEventResponseSchema;

export async function addRoomEvent(
  id: string,
  input: RoomInstanceEventInput
): Promise<RoomInstanceEventResponse> {
  return toRoomInstanceEventResponse(await addRoomInstanceEvent(id, input));
}
