import {
  enqueueLiveRoomCommand as enqueueLiveRoomCommandInDb,
  type EnqueueLiveRoomCommandInput,
  type LiveRoomCommandResponse
} from "@/features/live-state/_shared/db/commands";

export async function enqueueLiveRoomCommand(
  input: EnqueueLiveRoomCommandInput
): Promise<LiveRoomCommandResponse> {
  return enqueueLiveRoomCommandInDb(input);
}
