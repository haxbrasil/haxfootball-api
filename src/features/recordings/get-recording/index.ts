import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  type RecordingResponse,
  toRecordingResponse
} from "@/features/recordings/recording.contract";
import { recordings } from "@/features/recordings/recording.db";
import { notFound } from "@/shared/http/errors";

export async function getRecording(id: string): Promise<RecordingResponse> {
  const [recording] = await db
    .select()
    .from(recordings)
    .where(eq(recordings.publicId, id));

  if (!recording) {
    throw notFound("Recording not found");
  }

  return toRecordingResponse(recording);
}
