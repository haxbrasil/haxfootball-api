import {
  listLiveRoomCommands as listLiveRoomCommandsFromDb,
  type ListLiveRoomCommandsInput
} from "@/features/live-state/_shared/db/commands";

export async function listLiveRoomCommands(input: ListLiveRoomCommandsInput) {
  return listLiveRoomCommandsFromDb(input);
}
