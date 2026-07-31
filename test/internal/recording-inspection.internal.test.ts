import { describe, expect, it } from "bun:test";
import { inspectRecordingBytes } from "@/features/recordings/inspect-recording/inspection";
import {
  extendedRecordingBytes,
  recordingBytes
} from "@/test/e2e/fixtures/recording";

describe("recording structural inspection", () => {
  it("accepts a normal HBR2 recording", async () => {
    const inspection = await inspectRecordingBytes(recordingBytes());

    expect(inspection.state).toBe("playable");
    expect(
      inspection.issues.filter((issue) => issue.severity === "error")
    ).toEqual([]);
  });

  it("accepts a structurally valid extended recording", async () => {
    const inspection = await inspectRecordingBytes(extendedRecordingBytes());

    expect(inspection.state).toBe("playable");
    expect(
      inspection.issues.filter((issue) => issue.severity === "error")
    ).toEqual([]);
  });

  for (const byteLength of [0, 1, 2, 3, 4, 8, 16, 32, 64, 128]) {
    it(`rejects malformed replay bytes of length ${byteLength}`, async () => {
      const inspection = await inspectRecordingBytes(
        new Uint8Array(byteLength)
      );

      expect(["invalid", "unsupported"]).toContain(inspection.state);
      expect(
        inspection.issues.some((issue) => issue.severity === "error")
      ).toBe(true);
    });
  }

  it("does not throw when the decoder receives arbitrary bytes", async () => {
    const inspection = await inspectRecordingBytes(
      Uint8Array.from({ length: 512 }, (_, index) => (index * 37) % 256)
    );

    expect(["invalid", "unsupported"]).toContain(inspection.state);
    expect(inspection.issues.length).toBeGreaterThan(0);
  });
});
