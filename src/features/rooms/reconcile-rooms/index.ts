import { and, eq, inArray, lt } from "drizzle-orm";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { roomInstances } from "@/features/rooms/room.db";
import {
  closeRoomProcess,
  inspectRoomProcess
} from "@/features/rooms/room-process.service";

export async function reconcileOpenRooms(): Promise<void> {
  await closeStaleOpenRooms();

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

export async function closeStaleOpenRooms(
  input: { staleCloseAfterSeconds?: number; now?: Date } = {}
): Promise<number> {
  const staleCloseAfterSeconds =
    input.staleCloseAfterSeconds ?? env.roomStaleCloseAfterSeconds;

  if (staleCloseAfterSeconds <= 0) {
    return 0;
  }

  const now = input.now ?? new Date();
  const staleBefore = new Date(
    now.getTime() - staleCloseAfterSeconds * 1000
  ).toISOString();
  const staleRooms = await db
    .select()
    .from(roomInstances)
    .where(
      and(
        inArray(roomInstances.state, ["provisioning", "running"]),
        lt(roomInstances.createdAt, staleBefore)
      )
    );

  for (const room of staleRooms) {
    await closeRoomProcess(room);
  }

  if (staleRooms.length === 0) {
    return 0;
  }

  const closedAt = now.toISOString();

  await db
    .update(roomInstances)
    .set({
      state: "closed",
      closedAt,
      updatedAt: closedAt
    })
    .where(
      inArray(
        roomInstances.id,
        staleRooms.map((room) => room.id)
      )
    );

  return staleRooms.length;
}
