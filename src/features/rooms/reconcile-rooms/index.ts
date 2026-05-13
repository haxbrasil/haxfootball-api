import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { roomInstances } from "@/features/rooms/room.db";
import { inspectRoomProcess } from "@/features/rooms/room-process.service";

export async function reconcileOpenRooms(): Promise<void> {
  const rooms = await db
    .select()
    .from(roomInstances)
    .where(inArray(roomInstances.state, ["provisioning", "running"]));

  for (const room of rooms) {
    const status = await inspectRoomProcess(room);

    if (status.alive && status.expected) {
      if (room.state === "provisioning" && !room.roomLink && status.roomLink) {
        await db
          .update(roomInstances)
          .set({
            state: "running",
            roomLink: status.roomLink,
            updatedAt: new Date().toISOString()
          })
          .where(eq(roomInstances.id, room.id));
      }

      continue;
    }

    const now = new Date().toISOString();

    await db
      .update(roomInstances)
      .set({
        state: "closed",
        closedAt: now,
        updatedAt: now
      })
      .where(eq(roomInstances.id, room.id));
  }
}
