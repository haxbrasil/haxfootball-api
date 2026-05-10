import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  type RecordingResponse,
  listRecordingsResponseSchema,
  toRecordingResponse
} from "@/features/recordings/recording.contract";
import { recordings } from "@/features/recordings/recording.db";

export { listRecordingsResponseSchema };

export async function listRecordings(): Promise<RecordingResponse[]> {
  const recordingRows = await db
    .select()
    .from(recordings)
    .orderBy(desc(recordings.createdAt));

  return recordingRows.map(toRecordingResponse);
}
