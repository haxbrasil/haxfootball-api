import { asc, eq, isNull } from "drizzle-orm";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { clips } from "@/features/clips/db";
import { recordings } from "@/features/recordings/db";
import { getMediaRenditionsForClips } from "@/features/media-renditions/_shared/db/queries";
import type { Clip } from "@/features/clips/db";
import type { Recording } from "@/features/recordings/db";
import type { MediaRendition } from "@/features/media-renditions/db";
import { mediaRenditionProfileVersion } from "@/features/media-renditions/_shared/domain/jobs";

export type ClipRenditionBackfillCandidate = {
  clip: Clip;
  recording: Recording;
};

export async function listClipRenditionBackfillCandidates(): Promise<
  ClipRenditionBackfillCandidate[]
> {
  const rows = await db
    .select({ clip: clips, recording: recordings })
    .from(clips)
    .innerJoin(recordings, eq(clips.recordingId, recordings.id))
    .where(isNull(clips.archivedAt))
    .orderBy(asc(clips.id));

  const renditions = await getMediaRenditionsForClips(
    rows.map((row) => row.clip.id)
  );
  const byClipId = groupRenditions(renditions);

  return rows.filter((row) => {
    const clipRenditions = byClipId.get(row.clip.id) ?? [];
    return (
      !hasReadyRendition(clipRenditions, "clip_poster") ||
      !hasReadyRendition(clipRenditions, "clip_preview_video")
    );
  });
}

function groupRenditions(
  renditions: MediaRendition[]
): Map<number, MediaRendition[]> {
  const byClipId = new Map<number, MediaRendition[]>();
  for (const rendition of renditions) {
    const list = byClipId.get(rendition.clipId) ?? [];
    list.push(rendition);
    byClipId.set(rendition.clipId, list);
  }
  return byClipId;
}

function hasReadyRendition(
  renditions: MediaRendition[],
  purpose: MediaRendition["purpose"]
): boolean {
  return renditions.some(
    (rendition) =>
      rendition.purpose === purpose &&
      rendition.profileVersion === mediaRenditionProfileVersion(purpose) &&
      rendition.rendererVersion === env.mediaRendererVersion &&
      rendition.status === "ready" &&
      Boolean(rendition.objectKey)
  );
}
