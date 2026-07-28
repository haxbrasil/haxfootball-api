import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/features/matches/db";
import { finalizeInactiveRoomMatches } from "@/features/matches/finalize-inactive-room-matches";
import { roomInstances } from "@/features/rooms/db";

describe("inactive room match reconciliation", () => {
  it("discards pending matches and completes eligible matches at their last checkpoint", async () => {
    const now = "2026-07-28T12:00:30.000Z";
    const [room] = await db
      .insert(roomInstances)
      .values({
        uuid: crypto.randomUUID(),
        programId: 999_001,
        versionId: 999_001,
        state: "closed",
        launchConfig: {},
        public: false,
        commIdHash: crypto.randomUUID(),
        closedAt: "2026-07-28T12:01:00.000Z",
        failureReason: "Room process exited"
      })
      .returning();

    if (!room) {
      throw new Error("Room fixture was not created");
    }

    const [pending, ongoing] = await db
      .insert(matches)
      .values([
        {
          publicId: uniqueMatchId("p"),
          status: "pending",
          roomInstanceId: room.id,
          lastCheckpointAt: now,
          elapsedSeconds: 12
        },
        {
          publicId: uniqueMatchId("o"),
          status: "ongoing",
          roomInstanceId: room.id,
          lastCheckpointAt: now,
          elapsedSeconds: 30
        }
      ])
      .returning();

    const finalized = await finalizeInactiveRoomMatches();
    const pendingAfter = pending ? await readMatch(pending.id) : undefined;
    const ongoingAfter = ongoing ? await readMatch(ongoing.id) : undefined;

    expect(finalized).toBeGreaterThanOrEqual(2);
    expect(pendingAfter).toMatchObject({
      status: "discarded",
      endedAt: now,
      completionReason: null
    });
    expect(ongoingAfter).toMatchObject({
      status: "completed",
      endedAt: now,
      completionReason: "room-process-exit"
    });
  });
});

async function readMatch(id: number) {
  const [match] = await db.select().from(matches).where(eq(matches.id, id));

  return match;
}

function uniqueMatchId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 7)}`;
}
