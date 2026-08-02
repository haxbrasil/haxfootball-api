import { and, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { clips } from "@/features/clips/db";
import type { ListClipsQuery } from "@/features/clips/_shared/http/inputs";
import type { ClipWithRecording } from "@/features/clips/_shared/http/responses";
import { recordings } from "@/features/recordings/db";
import { cursorAfter, cursorSort, pageLimit } from "@lib";

export async function getClipRow(
  publicId: string
): Promise<ClipWithRecording | null> {
  const [row] = await db
    .select({ clip: clips, recording: recordings })
    .from(clips)
    .innerJoin(recordings, eq(clips.recordingId, recordings.id))
    .where(and(eq(clips.publicId, publicId), isNull(clips.archivedAt)));

  return row ?? null;
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

  return db
    .select({ clip: clips, recording: recordings })
    .from(clips)
    .innerJoin(recordings, eq(clips.recordingId, recordings.id))
    .where(and(...conditions))
    .orderBy(cursorSort(clips.id, "desc"))
    .limit(pageLimit(query));
}
