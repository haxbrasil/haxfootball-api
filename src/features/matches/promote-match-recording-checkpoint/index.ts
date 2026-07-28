import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { getMatchSummary } from "@/features/matches/_shared/db/queries";
import { matches } from "@/features/matches/db";
import { recordings } from "@/features/recordings/db";
import { createUniquePublicId } from "@/features/recordings/create-recording";

export async function promoteMatchRecordingCheckpoint(
  id: string
): Promise<void> {
  const current = await getMatchSummary(id);
  const sha256 = current.match.recordingCheckpointSha256;
  const objectKey = current.match.recordingCheckpointObjectKey;
  const sizeBytes = current.match.recordingCheckpointSizeBytes;

  if (
    current.match.recordingId !== null ||
    !sha256 ||
    !objectKey ||
    sizeBytes === null
  ) {
    return;
  }

  const [existing] = await db
    .select()
    .from(recordings)
    .where(eq(recordings.sha256, sha256));
  const recording =
    existing ??
    (
      await db
        .insert(recordings)
        .values({
          publicId: await createUniquePublicId(sha256),
          sha256,
          objectKey,
          sizeBytes
        })
        .returning()
    )[0];

  if (!recording) {
    throw new Error("Recording checkpoint promotion did not return a row");
  }

  await db
    .update(matches)
    .set({
      recordingId: recording.id,
      updatedAt: new Date().toISOString()
    })
    .where(eq(matches.id, current.match.id));
}
