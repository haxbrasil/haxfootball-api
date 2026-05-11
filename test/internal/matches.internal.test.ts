import { beforeAll, describe, expect, it } from "bun:test";
import { setupInternalTestDatabase } from "@/test/internal/helpers/database";

beforeAll(async () => {
  await setupInternalTestDatabase();
});

describe("match internals", () => {
  it("creates a match with a database-backed recording association", async () => {
    const { db } = await import("@/db/client");
    const { createMatch } = await import("@/features/matches/create-match");
    const { recordings } = await import("@/features/recordings/recording.db");

    const publicId = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const objectKey = `${publicId}.hbr2`;

    await db.insert(recordings).values({
      publicId,
      sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
      objectKey,
      sizeBytes: 123
    });

    const match = await createMatch({
      status: "ongoing",
      recordingId: publicId
    });

    expect(match.recording).toMatchObject({
      id: publicId,
      url: `${Bun.env.R2_PUBLIC_BASE_URL}/${objectKey}`,
      sizeBytes: 123
    });
  });
});
