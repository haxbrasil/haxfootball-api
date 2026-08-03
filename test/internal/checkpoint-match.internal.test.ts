import { beforeAll, describe, expect, it } from "bun:test";
import { setupInternalTestDatabase } from "./helpers/database";

beforeAll(async () => {
  await setupInternalTestDatabase();
});

describe("match checkpoint terminal idempotency", () => {
  it("acknowledges a repeated checkpoint with the current terminal status", async () => {
    const { createMatch } = await import("@/features/matches/create-match");
    const { checkpointMatch } =
      await import("@/features/matches/checkpoint-match");

    const match = await createMatch({
      status: "pending",
      score: { red: 0, blue: 0 }
    });
    const checkpoint = {
      revision: 1,
      observedAt: "2026-08-03T03:00:00.000Z",
      elapsedSeconds: 10,
      score: { red: 0, blue: 0 },
      events: [],
      status: "discarded" as const
    };

    await checkpointMatch(match.id, checkpoint);
    const repeated = await checkpointMatch(match.id, {
      ...checkpoint,
      revision: 2
    });

    expect(repeated.acknowledgedProducerSequence).toBe(0);
    expect(repeated.match.status).toBe("discarded");
  });
});
