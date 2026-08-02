import { type Static, t } from "elysia";
import type { Clip } from "@/features/clips/db";
import { clipPublicIdSchema } from "@/features/clips/_shared/http/inputs";
import {
  recordingResponseSchema,
  toRecordingResponse
} from "@/features/recordings/_shared/http/responses";
import type { Recording } from "@/features/recordings/db";
import { paginatedResponseSchema } from "@lib";

export const clipSourceKindSchema = t.Union([
  t.Literal("web"),
  t.Literal("room_command")
]);

export const clipResponseSchema = t.Object({
  id: clipPublicIdSchema,
  title: t.Nullable(t.String()),
  startTick: t.Integer({ minimum: 0 }),
  endTick: t.Integer({ minimum: 1 }),
  durationTicks: t.Integer({ minimum: 1 }),
  sourceKind: clipSourceKindSchema,
  recording: recordingResponseSchema,
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listClipsResponseSchema =
  paginatedResponseSchema(clipResponseSchema);

export type ClipResponse = Static<typeof clipResponseSchema>;

export type ClipWithRecording = {
  clip: Clip;
  recording: Recording;
};

export function toClipResponse({
  clip,
  recording
}: ClipWithRecording): ClipResponse {
  return {
    id: clip.publicId,
    title: clip.title,
    startTick: clip.startTick,
    endTick: clip.endTick,
    durationTicks: clip.endTick - clip.startTick,
    sourceKind: clip.sourceKind,
    recording: toRecordingResponse(recording),
    createdAt: clip.createdAt,
    updatedAt: clip.updatedAt
  };
}
