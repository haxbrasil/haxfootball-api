import { type Static, t } from "elysia";
import { env } from "@/config/env";
import type { Recording } from "@/features/recordings/db";
import { recordingPublicIdSchema } from "@/features/recordings/_shared/http/inputs";
import { paginatedResponseSchema } from "@lib";

export const recordingResponseSchema = t.Object({
  id: recordingPublicIdSchema,
  url: t.String(),
  sizeBytes: t.Number(),
  createdAt: t.String()
});

export const listRecordingsResponseSchema = paginatedResponseSchema(
  recordingResponseSchema
);

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
