import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { validateAsync } from "@hax-brasil/replay-decoder";
import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { env } from "@/config/env";
import { db } from "@/db/client";
import {
  type RecordingResponse,
  toRecordingResponse
} from "@/features/recordings/recording.contract";
import { recordings } from "@/features/recordings/recording.db";
import { badRequest } from "@/shared/http/errors";

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

const r2Client = new S3Client({
  endpoint: env.r2Endpoint,
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey
  }
});

export async function createRecording(
  input: CreateRecordingInput
): Promise<CreateRecordingResult> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());

  if (!(await isValidRecording(bytes))) {
    throw badRequest("Invalid recording file");
  }

  const sha256 = await hashBytes(bytes);
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

  await putRecordingObject(objectKey, bytes);

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

async function putRecordingObject(
  key: string,
  bytes: Uint8Array
): Promise<void> {
  if (env.r2UploadUrl && env.r2UploadToken) {
    await putRecordingObjectViaUploadApi(key, bytes);
    return;
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      Body: bytes,
      ContentType: "application/octet-stream"
    })
  );
}

async function putRecordingObjectViaUploadApi(
  key: string,
  bytes: Uint8Array
): Promise<void> {
  const baseUrl = env.r2UploadUrl?.replace(/\/+$/, "");
  const uploadToken = env.r2UploadToken;

  if (!baseUrl || !uploadToken) {
    throw new Error("R2 upload API is not configured");
  }

  const body = new ArrayBuffer(bytes.byteLength);
  const bodyView = new Uint8Array(body);

  bodyView.set(bytes);

  const response = await fetch(`${baseUrl}/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: new Blob([body], { type: "application/octet-stream" }),
    headers: {
      authorization: `Bearer ${uploadToken}`,
      "content-type": "application/octet-stream"
    }
  });

  if (!response.ok) {
    throw new Error(`R2 upload API failed with status ${response.status}`);
  }
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(buffer);

  view.set(bytes);

  const hash = await crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
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
