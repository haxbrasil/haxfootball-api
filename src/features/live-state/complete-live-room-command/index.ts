import {
  completeLiveRoomCommand as completeLiveRoomCommandInDb,
  type CompleteLiveRoomCommandInput,
  type LiveRoomCommandResponse
} from "@/features/live-state/_shared/db/commands";

export async function completeLiveRoomCommand(
  input: CompleteLiveRoomCommandInput
): Promise<LiveRoomCommandResponse> {
  return completeLiveRoomCommandInDb(input);
}
