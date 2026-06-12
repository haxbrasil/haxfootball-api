import { validateAsync } from "@hax-brasil/replay-decoder";
import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { env } from "@/config/env";
import { db } from "@/db/client";
import type { RecordingResponse } from "@/features/recordings/_shared/http/responses";
import { toRecordingResponse } from "@/features/recordings/_shared/http/responses";
import { recordings } from "@/features/recordings/db";
import { badRequest } from "@/shared/http/errors";
import { sha256Hex } from "@/shared/crypto/sha256";
import { putR2Object } from "@/shared/storage/r2";

export const createRecordingBodySchema = t.Object({
  file: t.File({
    maxSize: env.recordingMaxBytes
  })
});

export type CreateRecordingInput = Static<typeof createRecordingBodySchema>;

export type CreateRecordingResult = {
  recording: RecordingResponse;
  created: boolean;
};

export async function createRecording(
  input: CreateRecordingInput
): Promise<CreateRecordingResult> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());

  if (!(await isValidRecording(bytes))) {
    throw badRequest("Invalid recording file");
  }

  const sha256 = await sha256Hex(bytes);
  const [existingRecording] = await db
    .select()
    .from(recordings)
    .where(eq(recordings.sha256, sha256));

  if (existingRecording) {
    return {
      recording: toRecordingResponse(existingRecording),
      created: false
    };
  }

  const publicId = await createUniquePublicId(sha256);
  const objectKey = `${publicId}.hbr2`;

  await putR2Object({
    key: objectKey,
    body: bytes,
    contentType: "application/octet-stream"
  });

  const [recording] = await db
    .insert(recordings)
    .values({
      publicId,
      sha256,
      objectKey,
      sizeBytes: bytes.byteLength
    })
    .returning();

  return {
    recording: toRecordingResponse(recording),
    created: true
  };
}

async function isValidRecording(bytes: Uint8Array): Promise<boolean> {
  const report = await validateAsync(bytes, "strict");

  return !report.issues.some((issue) => issue.severity === "error");
}

export async function createUniquePublicId(sha256: string): Promise<string> {
  for (let length = 7; length <= sha256.length; length += 1) {
    const candidate = sha256.slice(0, length);
    const [existingRecording] = await db
      .select()
      .from(recordings)
      .where(eq(recordings.publicId, candidate));

    if (!existingRecording) {
      return candidate;
    }
  }

  throw badRequest("Recording public ID collision");
}
