import { decodeAsync } from "@hax-brasil/replay-decoder";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import type { Recording, RecordingFormat } from "@/features/recordings/db";
import { recordings } from "@/features/recordings/db";
import { badRequest } from "@/shared/http/errors";
import { getR2ObjectBytes } from "@/shared/storage/r2";
import {
  detectRecordingFormat,
  readHbrxExtensionVersion
} from "@/features/recordings/format";

export type RecordingTimeline = {
  format: RecordingFormat;
  extensionVersion: number | null;
  totalFrames: number;
};

export async function ensureRecordingTimeline(
  recording: Recording
): Promise<Recording & RecordingTimeline> {
  if (recording.format && recording.totalFrames !== null) {
    return recording as Recording & RecordingTimeline;
  }

  let bytes: Uint8Array;

  try {
    bytes = await getR2ObjectBytes(recording.objectKey);
  } catch {
    throw badRequest("A gravação não está disponível para criar um clipe");
  }

  let replay: Awaited<ReturnType<typeof decodeAsync>>;

  try {
    replay = await decodeAsync(bytes, { validationProfile: "structural" });
  } catch {
    throw badRequest("A gravação não é um replay HaxBall reproduzível");
  }

  if (!Number.isSafeInteger(replay.totalFrames) || replay.totalFrames <= 0) {
    throw badRequest("A duração da gravação não pôde ser identificada");
  }

  const timeline: RecordingTimeline = {
    format: detectRecordingFormat(bytes),
    extensionVersion: readHbrxExtensionVersion(bytes),
    totalFrames: replay.totalFrames
  };
  const [updated] = await db
    .update(recordings)
    .set(timeline)
    .where(eq(recordings.id, recording.id))
    .returning();

  return (updated ?? { ...recording, ...timeline }) as Recording &
    RecordingTimeline;
}
