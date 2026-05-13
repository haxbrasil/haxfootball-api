import { type Static, t } from "elysia";
import { env } from "@/config/env";
import type { Recording } from "@/features/recordings/recording.db";
import { paginatedResponseSchema } from "@lib";

export const recordingPublicIdSchema = t.String({
  minLength: 7,
  maxLength: 64,
  pattern: "^[a-f0-9]+$"
});

export const recordingResponseSchema = t.Object({
  id: recordingPublicIdSchema,
  url: t.String(),
  sizeBytes: t.Number(),
  createdAt: t.String()
});

export const listRecordingsResponseSchema = paginatedResponseSchema(
  recordingResponseSchema
);

export const recordingPublicIdParamsSchema = t.Object({
  id: recordingPublicIdSchema
});

export type RecordingResponse = Static<typeof recordingResponseSchema>;

export function toRecordingResponse(recording: Recording): RecordingResponse {
  return {
    id: recording.publicId,
    url: recordingUrl(recording.objectKey),
    sizeBytes: recording.sizeBytes,
    createdAt: recording.createdAt
  };
}

function recordingUrl(objectKey: string): string {
  return `${env.r2PublicBaseUrl.replace(/\/+$/, "")}/${objectKey}`;
}
