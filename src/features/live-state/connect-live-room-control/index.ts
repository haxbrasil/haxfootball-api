import { deliverQueuedRoomCommands } from "@/features/live-state/_shared/db/commands";
import { connectLiveRoom } from "@/features/live-state/_shared/domain/registry";
import { getRoomRow } from "@/features/rooms/_shared/db/queries";
import { assertRoomCommunicationId } from "@/features/rooms/_shared/domain/room-communication";

type ConnectLiveRoomControlInput = {
  roomId: string;
  commId: string;
  connection: {
    send(message: unknown): void;
  };
};

export async function connectLiveRoomControl(
  input: ConnectLiveRoomControlInput
): Promise<void> {
  const { room, program } = await getRoomRow(input.roomId);

  await assertRoomCommunicationId(room, input.commId);
  connectLiveRoom({
    roomId: input.roomId,
    contract: program.liveStateContract,
    connection: input.connection
  });
  await deliverQueuedRoomCommands(input.roomId);
}
