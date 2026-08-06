import { enqueueKnownJob } from "@/features/jobs/_shared/domain/execution";
import type { Clip } from "@/features/clips/db";
import type { Recording } from "@/features/recordings/db";
import { env } from "@/config/env";
import type { MediaRenditionPurpose } from "@/features/media-renditions/db";
import type { ClipExportProfile } from "@/features/media-renditions/db";
import {
  expireMediaRendition,
  getMediaRenditionByCacheKey,
  insertMediaRenditionIfMissing,
  resetMediaRenditionForRetry,
  renewExpiredMediaRendition
} from "@/features/media-renditions/_shared/db/queries";
import {
  mediaRenderJobType,
  mediaJobHandlers
} from "@/features/media-renditions/render";
import { sha256Hex } from "@/shared/crypto/sha256";

export async function enqueueClipRenditions(
  clip: Clip,
  recording: Recording
): Promise<void> {
  await Promise.all(
    (["clip_poster", "clip_preview_video"] as const).map((purpose) =>
      enqueueClipRendition({ clip, recording, purpose })
    )
  );
}

export function mediaRenditionProfileVersion(
  purpose: MediaRenditionPurpose
): string {
  return purpose === "clip_poster"
    ? `${env.mediaRendererVersion}:poster-1280x720`
    : env.mediaRendererVersion;
}

export async function enqueueClipExport(input: {
  clip: Clip;
  recording: Recording;
  profile: ClipExportProfile;
}): Promise<void> {
  await enqueueClipRendition({
    clip: input.clip,
    recording: input.recording,
    purpose: "clip_export",
    exportProfile: input.profile
  });
}

async function enqueueClipRendition(input: {
  clip: Clip;
  recording: Recording;
  purpose: MediaRenditionPurpose;
  exportProfile?: ClipExportProfile;
}): Promise<void> {
  const sourceFingerprint = sourceFingerprintFor(
    input.recording.sha256,
    input.clip
  );
  const cacheKey = await renditionCacheKey(input);
  let rendition = await getMediaRenditionByCacheKey(cacheKey);
  let shouldEnqueue = false;

  if (!rendition) {
    const result = await insertMediaRenditionIfMissing({
      clipId: input.clip.id,
      purpose: input.purpose,
      cacheKey,
      sourceFingerprint,
      profileVersion: mediaRenditionProfileVersion(input.purpose),
      exportProfile: input.exportProfile ?? null,
      expiresAt:
        input.purpose === "clip_export"
          ? new Date(Date.now() + env.clipExportTtlSeconds * 1000).toISOString()
          : null
    });
    rendition = result.rendition;
    shouldEnqueue = result.created;
  } else if (
    rendition.status === "expired" ||
    (rendition.purpose === "clip_export" &&
      rendition.expiresAt !== null &&
      rendition.expiresAt <= new Date().toISOString())
  ) {
    if (rendition.status !== "expired") {
      await expireMediaRendition(rendition);
      rendition = (await getMediaRenditionByCacheKey(cacheKey)) ?? rendition;
    }
    const result = await renewExpiredMediaRendition(
      rendition,
      new Date(Date.now() + env.clipExportTtlSeconds * 1000).toISOString()
    );
    rendition = result.rendition;
    shouldEnqueue = result.renewed;
  } else if (
    rendition.status === "ready" ||
    rendition.status === "queued" ||
    rendition.status === "running"
  ) {
    return;
  } else {
    const result = await resetMediaRenditionForRetry(rendition);
    rendition = result.rendition;
    shouldEnqueue = result.reset;
  }

  if (!shouldEnqueue) {
    return;
  }

  await enqueueKnownJob({
    type: mediaRenderJobType,
    queue: "media",
    payload: { renditionId: rendition.uuid },
    handlers: mediaJobHandlers
  });
}

async function renditionCacheKey(input: {
  clip: Clip;
  recording: Recording;
  purpose: MediaRenditionPurpose;
  exportProfile?: ClipExportProfile;
}): Promise<string> {
  const sourceFingerprint = sourceFingerprintFor(
    input.recording.sha256,
    input.clip
  );
  const source = [
    "clip-rendition-v1",
    env.mediaRendererVersion,
    input.purpose,
    input.exportProfile
      ? `${input.exportProfile.format}:${input.exportProfile.orientation}:${input.exportProfile.scoreboard}`
      : "preview-v2",
    sourceFingerprint
  ].join(":");
  return `clip-rendition-${await sha256Hex(new TextEncoder().encode(source))}`;
}

function sourceFingerprintFor(
  recordingSha256: string,
  clip: Pick<Clip, "startTick" | "endTick">
): string {
  return ["clip-source-v1", recordingSha256, clip.startTick, clip.endTick].join(
    ":"
  );
}
