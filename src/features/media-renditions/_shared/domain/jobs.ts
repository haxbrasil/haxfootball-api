import { enqueueKnownJob } from "@/features/jobs/_shared/domain/execution";
import type { Clip } from "@/features/clips/db";
import type { Recording } from "@/features/recordings/db";
import { env } from "@/config/env";
import type { MediaRenditionPurpose } from "@/features/media-renditions/db";
import {
  getMediaRenditionByCacheKey,
  insertMediaRenditionIfMissing,
  resetMediaRenditionForRetry
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

async function enqueueClipRendition(input: {
  clip: Clip;
  recording: Recording;
  purpose: MediaRenditionPurpose;
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
      profileVersion: env.mediaRendererVersion
    });
    rendition = result.rendition;
    shouldEnqueue = result.created;
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
}): Promise<string> {
  const sourceFingerprint = sourceFingerprintFor(
    input.recording.sha256,
    input.clip
  );
  const source = [
    "clip-rendition-v1",
    env.mediaRendererVersion,
    input.purpose,
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
