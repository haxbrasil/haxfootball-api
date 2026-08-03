import { and, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { clips } from "@/features/clips/db";
import type { ListClipsQuery } from "@/features/clips/_shared/http/inputs";
import type { ClipWithRecording } from "@/features/clips/_shared/http/responses";
import { recordings } from "@/features/recordings/db";
import { getMediaRenditionsForClips } from "@/features/media-renditions/_shared/db/queries";
import { cursorAfter, cursorSort, pageLimit } from "@lib";

export async function getClipRow(
  publicId: string
): Promise<ClipWithRecording | null> {
  const [row] = await db
    .select({ clip: clips, recording: recordings })
    .from(clips)
    .innerJoin(recordings, eq(clips.recordingId, recordings.id))
    .where(and(eq(clips.publicId, publicId), isNull(clips.archivedAt)));

  if (!row) {
    return null;
  }

  return {
    ...row,
    renditions: await getMediaRenditionsForClips([row.clip.id])
  };
}

export async function listClipRows(query: ListClipsQuery) {
  const conditions: SQL[] = [isNull(clips.archivedAt)];
  const cursor = cursorAfter(clips.id, query.cursor, "desc");

  if (cursor) {
    conditions.push(cursor);
  }
  if (query.recordingId) {
    conditions.push(eq(recordings.publicId, query.recordingId));
  }

  const rows = await db
    .select({ clip: clips, recording: recordings })
    .from(clips)
    .innerJoin(recordings, eq(clips.recordingId, recordings.id))
    .where(and(...conditions))
    .orderBy(cursorSort(clips.id, "desc"))
    .limit(pageLimit(query));

  const renditions = await getMediaRenditionsForClips(
    rows.map((row) => row.clip.id)
  );
  const byClipId = new Map<number, typeof renditions>();
  for (const rendition of renditions) {
    const list = byClipId.get(rendition.clipId) ?? [];
    list.push(rendition);
    byClipId.set(rendition.clipId, list);
  }

  return rows.map((row) => ({
    ...row,
    renditions: byClipId.get(row.clip.id) ?? []
  }));
}
