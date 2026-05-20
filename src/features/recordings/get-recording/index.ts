import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import type { RecordingResponse } from "@/features/recordings/_shared/http/responses";
import { toRecordingResponse } from "@/features/recordings/_shared/http/responses";
import { recordings } from "@/features/recordings/db";
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
