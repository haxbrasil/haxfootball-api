import { beforeAll, describe, expect, it } from "bun:test";
import { setupInternalTestDatabase } from "@/test/internal/helpers/database";

beforeAll(async () => {
  await setupInternalTestDatabase();
});

describe("media rendition responses", () => {
  it("exposes each rendition lifecycle without leaking renderer internals", async () => {
    const { toClipResponse } =
      await import("@/features/clips/_shared/http/responses");
    const createdAt = "2026-08-03T00:00:00.000Z";
    const response = toClipResponse({
      clip: {
        id: 1,
        publicId: "clip-1",
        recordingId: 1,
        startTick: 120,
        endTick: 1_920,
        title: "Touchdown",
        sourceKind: "web",
        archivedAt: null,
        createdAt,
        updatedAt: createdAt
      },
      recording: {
        id: 1,
        publicId: "recording-1",
        sha256: "sha256",
        objectKey: "recordings/recording-1.hbrx",
        sizeBytes: 100,
        format: "hbrx",
        extensionVersion: 1,
        totalFrames: 10_000,
        createdAt
      },
      renditions: [
        {
          id: 1,
          uuid: "poster-1",
          sourceKind: "clip",
          clipId: 1,
          sourceFingerprint: "clip-source-v1:sha256:120:1920",
          purpose: "clip_poster",
          cacheKey: "poster-cache",
          profileVersion: "hbr2vid-v1",
          exportProfile: null,
          status: "ready",
          objectKey: "media/clips/poster.png",
          contentType: "image/png",
          sizeBytes: 100,
          checksumSha256: "poster-checksum",
          width: 640,
          height: 360,
          durationTicks: 1_800,
          rendererVersion: "hbr2vid-v1",
          expiresAt: null,
          errorCode: null,
          errorMessage: null,
          createdAt,
          updatedAt: createdAt
        },
        {
          id: 2,
          uuid: "video-1",
          sourceKind: "clip",
          clipId: 1,
          sourceFingerprint: "clip-source-v1:sha256:120:1920",
          purpose: "clip_preview_video",
          cacheKey: "video-cache",
          profileVersion: "hbr2vid-v1",
          exportProfile: null,
          status: "failed",
          objectKey: null,
          contentType: null,
          sizeBytes: null,
          checksumSha256: null,
          width: null,
          height: null,
          durationTicks: null,
          rendererVersion: null,
          expiresAt: null,
          errorCode: "render_failed",
          errorMessage: "renderer unavailable",
          createdAt,
          updatedAt: createdAt
        }
      ]
    });

    expect(response.preview).toMatchObject({
      status: "pending",
      posterStatus: "ready",
      videoStatus: "failed",
      posterUrl: "https://recs.haxbrasil.com/media/clips/poster.png",
      videoUrl: null,
      width: 640,
      height: 360,
      durationTicks: 1_800
    });
    expect(response.preview).not.toHaveProperty("errorMessage");
    expect(response).not.toHaveProperty("format");
  });

  it("prefers the current renderer while retaining a ready legacy fallback", async () => {
    const { env } = await import("@/config/env");
    const { toClipResponse } =
      await import("@/features/clips/_shared/http/responses");
    const createdAt = "2026-08-03T00:00:00.000Z";
    const base = {
      id: 1,
      uuid: "rendition",
      sourceKind: "clip" as const,
      clipId: 1,
      sourceFingerprint: "source",
      purpose: "clip_preview_video" as const,
      cacheKey: "cache",
      profileVersion: "legacy-renderer",
      exportProfile: null,
      status: "ready" as const,
      objectKey: "media/clips/legacy.mp4",
      contentType: "video/mp4",
      sizeBytes: 100,
      checksumSha256: "checksum",
      width: 1280,
      height: 720,
      durationTicks: 1_800,
      rendererVersion: "legacy-renderer",
      expiresAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt,
      updatedAt: createdAt
    };
    const response = toClipResponse({
      clip: {
        id: 1,
        publicId: "clip-current-renderer",
        recordingId: 1,
        startTick: 0,
        endTick: 1_800,
        title: null,
        sourceKind: "web",
        archivedAt: null,
        createdAt,
        updatedAt: createdAt
      },
      recording: {
        id: 1,
        publicId: "recording-current-renderer",
        sha256: "sha256",
        objectKey: "recordings/recording.hbr2",
        sizeBytes: 100,
        format: "hbr2",
        extensionVersion: 1,
        totalFrames: 10_000,
        createdAt
      },
      renditions: [
        base,
        {
          ...base,
          id: 2,
          uuid: "current-rendition",
          cacheKey: "current-cache",
          profileVersion: env.mediaRendererVersion,
          rendererVersion: env.mediaRendererVersion,
          objectKey: "media/clips/current.mp4",
          createdAt: "2026-08-03T00:01:00.000Z",
          updatedAt: "2026-08-03T00:01:00.000Z"
        }
      ]
    });

    expect(response.preview.videoUrl).toBe(
      "https://recs.haxbrasil.com/media/clips/current.mp4"
    );
  });

  it("claims a queued rendition only once", async () => {
    const { db } = await import("@/db/client");
    const { clips } = await import("@/features/clips/db");
    const { recordings } = await import("@/features/recordings/db");
    const { mediaRenditions } = await import("@/features/media-renditions/db");
    const { claimMediaRendition } =
      await import("@/features/media-renditions/_shared/db/queries");
    const createdAt = new Date().toISOString();
    const [recording] = await db
      .insert(recordings)
      .values({
        publicId: crypto.randomUUID(),
        sha256: crypto.randomUUID(),
        objectKey: `test/${crypto.randomUUID()}.hbr2`,
        sizeBytes: 1,
        format: "hbr2",
        totalFrames: 60,
        createdAt
      })
      .returning();
    const [clip] = await db
      .insert(clips)
      .values({
        publicId: crypto.randomUUID(),
        recordingId: recording.id,
        startTick: 0,
        endTick: 30,
        sourceKind: "web",
        createdAt,
        updatedAt: createdAt
      })
      .returning();
    const [rendition] = await db
      .insert(mediaRenditions)
      .values({
        uuid: crypto.randomUUID(),
        sourceKind: "clip",
        clipId: clip.id,
        sourceFingerprint: "test-source",
        purpose: "clip_preview_video",
        cacheKey: crypto.randomUUID(),
        profileVersion: "test",
        status: "queued",
        createdAt,
        updatedAt: createdAt
      })
      .returning();

    const [first, second] = await Promise.all([
      claimMediaRendition(rendition.id),
      claimMediaRendition(rendition.id)
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect([first, second].find(Boolean)?.status).toBe("running");
  });

  it("marks ready renditions from an older renderer as backfill candidates", async () => {
    const { db } = await import("@/db/client");
    const { clips } = await import("@/features/clips/db");
    const { recordings } = await import("@/features/recordings/db");
    const { mediaRenditions } = await import("@/features/media-renditions/db");
    const { listClipRenditionBackfillCandidates } =
      await import("@/features/media-renditions/backfill");
    const createdAt = new Date().toISOString();
    const [recording] = await db
      .insert(recordings)
      .values({
        publicId: crypto.randomUUID(),
        sha256: crypto.randomUUID(),
        objectKey: `test/${crypto.randomUUID()}.hbr2`,
        sizeBytes: 1,
        format: "hbr2",
        totalFrames: 60,
        createdAt
      })
      .returning();
    const [clip] = await db
      .insert(clips)
      .values({
        publicId: crypto.randomUUID(),
        recordingId: recording.id,
        startTick: 0,
        endTick: 30,
        sourceKind: "web",
        createdAt,
        updatedAt: createdAt
      })
      .returning();

    await db.insert(mediaRenditions).values(
      (["clip_poster", "clip_preview_video"] as const).map((purpose) => ({
        uuid: crypto.randomUUID(),
        sourceKind: "clip" as const,
        clipId: clip.id,
        sourceFingerprint: "test-source",
        purpose,
        cacheKey: crypto.randomUUID(),
        profileVersion: "older-renderer",
        status: "ready" as const,
        objectKey: `media/${crypto.randomUUID()}`,
        contentType: purpose === "clip_poster" ? "image/png" : "video/mp4",
        sizeBytes: 1,
        checksumSha256: "checksum",
        width: purpose === "clip_poster" ? 640 : 1280,
        height: purpose === "clip_poster" ? 360 : 720,
        durationTicks: 30,
        rendererVersion: "older-renderer",
        createdAt,
        updatedAt: createdAt
      }))
    );

    const candidates = await listClipRenditionBackfillCandidates();

    expect(
      candidates.some(({ clip: candidate }) => candidate.id === clip.id)
    ).toBe(true);
  });
});
