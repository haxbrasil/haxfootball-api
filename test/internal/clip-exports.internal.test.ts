import { beforeAll, describe, expect, it } from "bun:test";
import { setupInternalTestDatabase } from "@/test/internal/helpers/database";

beforeAll(async () => setupInternalTestDatabase());

describe("clip export profiles", () => {
  it("keeps the supported format, orientation, and scoreboard choices explicit", async () => {
    const { clipExportContentType, clipExportExtension, clipExportProfileKey } =
      await import("@/features/clips/_shared/domain/exports");
    expect(clipExportExtension("webm")).toBe("webm");
    expect(clipExportContentType("gif")).toBe("image/gif");
    expect(
      clipExportProfileKey({
        format: "mp4",
        orientation: "vertical",
        scoreboard: "floating-compact"
      })
    ).toBe("mp4:vertical:floating-compact");
  });

  it("versions vertical action framing separately from earlier exports", async () => {
    const { mediaRenditionProfileVersion } =
      await import("@/features/media-renditions/_shared/domain/jobs");
    expect(mediaRenditionProfileVersion("clip_export")).toContain(
      "clip-export-vertical-action-v1"
    );
  });

  it("reports expired export artifacts without issuing their stale URL", async () => {
    const { toClipExportResponse } =
      await import("@/features/clips/_shared/http/responses");
    const response = toClipExportResponse({
      id: 1,
      uuid: "export-1",
      sourceKind: "clip",
      clipId: 1,
      sourceFingerprint: "source",
      purpose: "clip_export",
      cacheKey: "cache",
      profileVersion: "renderer",
      exportProfile: {
        format: "mp4",
        orientation: "landscape",
        scoreboard: "default"
      },
      status: "ready",
      objectKey: "media/clips/export.mp4",
      contentType: "video/mp4",
      sizeBytes: 12,
      checksumSha256: "checksum",
      width: 1280,
      height: 720,
      durationTicks: 120,
      rendererVersion: "renderer",
      expiresAt: "2020-01-01T00:00:00.000Z",
      errorCode: null,
      errorMessage: null,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z"
    });
    expect(response.status).toBe("expired");
    expect(response.url).toBeNull();
  });
});
