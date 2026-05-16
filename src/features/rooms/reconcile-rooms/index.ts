import { and, eq, inArray, lt } from "drizzle-orm";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { roomInstances, roomPrograms } from "@/features/rooms/room.db";
import {
  closeRoomProcess,
  inspectRoomProcess
} from "@/features/rooms/room-process.service";

export type ReconcileOpenRoomsResult = {
  inspected: number;
  closed: number;
  failed: number;
  externalMarkedRunning: number;
  staleClosed: number;
};

export async function reconcileOpenRooms(): Promise<ReconcileOpenRoomsResult> {
  const staleClosed = await closeStaleOpenRooms();

  const rooms = await db
    .select({
      room: roomInstances,
      program: roomPrograms
    })
    .from(roomInstances)
    .innerJoin(roomPrograms, eq(roomInstances.programId, roomPrograms.id))
    .where(inArray(roomInstances.state, ["provisioning", "running"]));

  const result: ReconcileOpenRoomsResult = {
    inspected: staleClosed + rooms.length,
    closed: 0,
    failed: 0,
    externalMarkedRunning: 0,
    staleClosed
  };

  for (const { room, program } of rooms) {
    const status = await inspectRoomProcess(room);

    if (room.state === "provisioning" && shouldFailProvisioningRoom(room)) {
      await closeRoomProcess(room);
      await markRoomFailed(
        room.id,
        "Room did not become ready before provisioning timeout"
      );
      result.failed += 1;
      continue;
    }

    if (status.alive && status.expected) {
      if (
        program.integrationMode === "external" &&
        room.state === "provisioning" &&
        !room.roomLink &&
        status.roomLink
      ) {
        await db
          .update(roomInstances)
          .set({
            state: "running",
            roomLink: status.roomLink,
            updatedAt: new Date().toISOString()
          })
          .where(eq(roomInstances.id, room.id));
        result.externalMarkedRunning += 1;
      }

      continue;
    }

    const now = new Date().toISOString();
    const state = room.state === "provisioning" ? "failed" : "closed";

    await db
      .update(roomInstances)
      .set({
        state,
        closedAt: state === "closed" ? now : null,
        failedAt: state === "failed" ? now : null,
        failureReason:
          state === "failed" ? "Room process exited before readiness" : null,
        updatedAt: now
      })
      .where(eq(roomInstances.id, room.id));

    if (state === "closed") {
      result.closed += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}

function shouldFailProvisioningRoom(room: { createdAt: string }): boolean {
  const createdAt = Date.parse(room.createdAt);

  if (Number.isNaN(createdAt)) {
    return false;
  }

  return Date.now() - createdAt >= env.roomProvisioningTimeoutSeconds * 1000;
}

async function markRoomFailed(id: number, reason: string): Promise<void> {
  const now = new Date().toISOString();

  await db
    .update(roomInstances)
    .set({
      state: "failed",
      failedAt: now,
      failureReason: reason,
      updatedAt: now
    })
    .where(eq(roomInstances.id, id));
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
