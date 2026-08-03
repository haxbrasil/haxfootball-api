import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clips } from "@/features/clips/db";
import { getClipConfiguration } from "@/features/clips/_shared/domain/config";
import { getClipRow } from "@/features/clips/_shared/db/queries";
import type { UpdateClipInput } from "@/features/clips/_shared/http/inputs";
import type { ClipResponse } from "@/features/clips/_shared/http/responses";
import { toClipResponse } from "@/features/clips/_shared/http/responses";
import {
  normalizeClipTitle,
  validateClipRange
} from "@/features/clips/_shared/domain/validation";
import { ensureRecordingTimeline } from "@/features/recordings/read-recording-timeline";
import { notFound } from "@/shared/http/errors";
import { enqueueClipRenditions } from "@/features/media-renditions/_shared/domain/jobs";

export async function updateClip(
  publicId: string,
  input: UpdateClipInput
): Promise<ClipResponse> {
  const current = await getClipRow(publicId);

  if (!current) {
    throw notFound("Clip not found");
  }

  const startTick = input.startTick ?? current.clip.startTick;
  const endTick = input.endTick ?? current.clip.endTick;
  const timeline = await ensureRecordingTimeline(current.recording);
  const clipConfiguration = getClipConfiguration();

  validateClipRange({
    startTick,
    endTick,
    totalFrames: timeline.totalFrames,
    ...clipConfiguration
  });

  const [clip] = await db
    .update(clips)
    .set({
      startTick,
      endTick,
      title:
        input.title === undefined
          ? current.clip.title
          : normalizeClipTitle(input.title),
      updatedAt: new Date().toISOString()
    })
    .where(eq(clips.id, current.clip.id))
    .returning();

  if (!clip) {
    throw new Error("Clip could not be updated");
  }

  const row = await getClipRow(publicId);
  if (!row) {
    throw new Error("Clip was updated but could not be read");
  }

  await enqueueClipRenditions(row.clip, row.recording);
  return toClipResponse((await getClipRow(publicId)) ?? row);
}
