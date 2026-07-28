import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { getMatchSummary } from "@/features/matches/_shared/db/queries";
import { matches } from "@/features/matches/db";
import { sha256Hex } from "@/shared/crypto/sha256";
import { badRequest } from "@/shared/http/errors";
import { putR2Object } from "@/shared/storage/r2";

export const checkpointMatchRecordingBodySchema = t.Object({
  revision: t.Numeric({ minimum: 1 }),
  file: t.File({ maxSize: env.recordingMaxBytes })
});

export const checkpointMatchRecordingResponseSchema = t.Object({
  revision: t.Integer({ minimum: 0 }),
  sizeBytes: t.Integer({ minimum: 0 })
});

export type CheckpointMatchRecordingInput = Static<
  typeof checkpointMatchRecordingBodySchema
>;

export async function checkpointMatchRecording(
  id: string,
  input: CheckpointMatchRecordingInput
) {
  const current = await getMatchSummary(id);

  if (
    current.match.status === "completed" ||
    current.match.status === "discarded"
  ) {
    throw badRequest("Terminal matches cannot accept recording checkpoints");
  }

  if (input.revision <= current.match.recordingCheckpointRevision) {
    return {
      revision: current.match.recordingCheckpointRevision,
      sizeBytes: current.match.recordingCheckpointSizeBytes ?? 0
    };
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const objectKey = `match-recording-checkpoints/${current.match.publicId}.hbr2`;

  await putR2Object({
    key: objectKey,
    body: bytes,
    contentType: "application/octet-stream"
  });

  await db
    .update(matches)
    .set({
      recordingCheckpointRevision: input.revision,
      recordingCheckpointObjectKey: objectKey,
      recordingCheckpointSha256: sha256,
      recordingCheckpointSizeBytes: bytes.byteLength,
      updatedAt: new Date().toISOString()
    })
    .where(eq(matches.id, current.match.id));

  return {
    revision: input.revision,
    sizeBytes: bytes.byteLength
  };
}
