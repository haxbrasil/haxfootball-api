import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clips } from "@/features/clips/db";
import { getClipConfiguration } from "@/features/clips/_shared/domain/config";
import { getClipRow } from "@/features/clips/_shared/db/queries";
import type { CreateClipInput } from "@/features/clips/_shared/http/inputs";
import type { ClipResponse } from "@/features/clips/_shared/http/responses";
import { toClipResponse } from "@/features/clips/_shared/http/responses";
import {
  normalizeClipTitle,
  validateClipRange
} from "@/features/clips/_shared/domain/validation";
import { recordings } from "@/features/recordings/db";
import { ensureRecordingTimeline } from "@/features/recordings/read-recording-timeline";
import { notFound } from "@/shared/http/errors";
import { enqueueClipRenditions } from "@/features/media-renditions/_shared/domain/jobs";

export async function createClip(
  input: CreateClipInput
): Promise<ClipResponse> {
  const [recording] = await db
    .select()
    .from(recordings)
    .where(eq(recordings.publicId, input.recordingId));

  if (!recording) {
    throw notFound("Recording not found");
  }

  const timeline = await ensureRecordingTimeline(recording);
  const clipConfiguration = getClipConfiguration();
  validateClipRange({
    startTick: input.startTick,
    endTick: input.endTick,
    totalFrames: timeline.totalFrames,
    ...clipConfiguration
  });

  const [clip] = await db
    .insert(clips)
    .values({
      publicId: crypto.randomUUID(),
      recordingId: recording.id,
      startTick: input.startTick,
      endTick: input.endTick,
      title: normalizeClipTitle(input.title),
      sourceKind: "web"
    })
    .returning();

  const row = clip ? await getClipRow(clip.publicId) : null;

  if (!row) {
    throw new Error("Clip was created but could not be read");
  }

  await enqueueClipRenditions(row.clip, row.recording);
  const refreshed = await getClipRow(row.clip.publicId);

  return toClipResponse(refreshed ?? row);
}
