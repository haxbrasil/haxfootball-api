import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { setupInternalTestDatabase } from "./helpers/database";
import { db } from "@/db/client";
import { matches } from "@/features/matches/db";
import { finalizeInactiveRoomMatches } from "@/features/matches/finalize-inactive-room-matches";
import {
  roomInstances,
  roomPrograms,
  roomProgramVersions
} from "@/features/rooms/db";

beforeAll(async () => {
  await setupInternalTestDatabase();
});

describe("inactive room match reconciliation", () => {
  it("discards pending matches and completes eligible matches at their last checkpoint", async () => {
    const now = "2026-07-28T12:00:30.000Z";
    const [program] = await db
      .insert(roomPrograms)
      .values({
        uuid: crypto.randomUUID(),
        name: `reconciliation-${crypto.randomUUID()}`,
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: []
      })
      .returning();

    if (!program) {
      throw new Error("Room program fixture was not created");
    }

    const [version] = await db
      .insert(roomProgramVersions)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        version: "v1.0.0",
        artifact: {
          releaseId: crypto.randomUUID(),
          tagName: "v1.0.0",
          assetName: "room-v1.0.0.tgz",
          assetUrl: "https://example.com/room-v1.0.0.tgz",
          publishedAt: now
        },
        entrypoint: "dist/server.js"
      })
      .returning();

    if (!version) {
      throw new Error("Room program version fixture was not created");
    }

    const [room] = await db
      .insert(roomInstances)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        versionId: version.id,
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
