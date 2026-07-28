import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/features/matches/db";
import { promoteMatchRecordingCheckpoint } from "@/features/matches/promote-match-recording-checkpoint";
import { roomInstances } from "@/features/rooms/db";

export async function finalizeInactiveRoomMatches(): Promise<number> {
  const rows = await db
    .select({
      match: matches,
      room: roomInstances
    })
    .from(matches)
    .innerJoin(roomInstances, eq(matches.roomInstanceId, roomInstances.id))
    .where(
      and(
        inArray(matches.status, ["pending", "ongoing"]),
        inArray(roomInstances.state, ["closed", "failed"])
      )
    );

  for (const { match, room } of rows) {
    const completed = match.status === "ongoing";
    const completionReason =
      room.failureReason === "Room process exited"
        ? "room-process-exit"
        : "room-closed";

    await db
      .update(matches)
      .set({
        status: completed ? "completed" : "discarded",
        completionReason: completed ? completionReason : null,
        endedAt:
          match.lastCheckpointAt ??
          room.closedAt ??
          room.failedAt ??
          new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .where(and(eq(matches.id, match.id), eq(matches.status, match.status)));

    if (completed) {
      await promoteMatchRecordingCheckpoint(match.publicId);
    }
  }

  return rows.length;
}
