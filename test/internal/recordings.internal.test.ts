import { beforeAll, describe, expect, it } from "bun:test";
import { setupInternalTestDatabase } from "@/test/internal/helpers/database";

beforeAll(async () => {
  await setupInternalTestDatabase();
});

describe("recording internals", () => {
  it("extends the public ID when a hash prefix collides", async () => {
    const { db } = await import("@/db/client");
    const { createUniquePublicId } = await import(
      "@/features/recordings/create-recording"
    );
    const { recordings: recordingsTable } = await import(
      "@/features/recordings/recording.db"
    );

    await db.insert(recordingsTable).values({
      publicId: "abcdef0",
      sha256: "abcdef0".padEnd(64, "0"),
      objectKey: "abcdef0.hbr2",
      sizeBytes: 1
    });

    const publicId = await createUniquePublicId("abcdef1".padEnd(64, "1"));

    expect(publicId).toBe("abcdef1");
  });

  it("lists recordings newest first", async () => {
    const { db } = await import("@/db/client");
    const { listRecordings } = await import(
      "@/features/recordings/list-recordings"
    );
    const { recordings: recordingsTable } = await import(
      "@/features/recordings/recording.db"
    );

    await db.insert(recordingsTable).values([
      {
        publicId: "aaaaaaa",
        sha256: "a".repeat(64),
        objectKey: "aaaaaaa.hbr2",
        sizeBytes: 1,
        createdAt: "2026-05-10T12:00:00.000Z"
      },
      {
        publicId: "bbbbbbb",
        sha256: "b".repeat(64),
        objectKey: "bbbbbbb.hbr2",
        sizeBytes: 2,
        createdAt: "2026-05-10T12:01:00.000Z"
      }
    ]);

    const page = await listRecordings();
    const firstIndex = page.items.findIndex(
      (recording) => recording.id === "aaaaaaa"
    );
    const secondIndex = page.items.findIndex(
      (recording) => recording.id === "bbbbbbb"
    );

    expect(secondIndex).toBeLessThan(firstIndex);
  });
});
