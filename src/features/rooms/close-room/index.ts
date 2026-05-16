import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  roomResponseSchema,
  toRoomResponse,
  type RoomResponse
} from "@/features/rooms/room.contract";
import { roomInstances } from "@/features/rooms/room.db";
import { getRoomRow } from "@/features/rooms/room.persistence";
import { closeRoomProcess } from "@/features/rooms/room-process.service";

export { roomResponseSchema as closeRoomResponseSchema };

export async function closeRoom(uuid: string): Promise<RoomResponse> {
  const row = await getRoomRow(uuid);

  if (row.room.state === "closed" || row.room.state === "failed") {
    return toRoomResponse(row);
  }

  await closeRoomProcess(row.room);

  const now = new Date().toISOString();
  const [closedRoom] = await db
    .update(roomInstances)
    .set({
      state: "closed",
      closedAt: now,
      updatedAt: now
    })
    .where(eq(roomInstances.id, row.room.id))
    .returning();

  return toRoomResponse({
    ...row,
    room: closedRoom
  });
}
