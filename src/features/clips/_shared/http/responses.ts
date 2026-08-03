import { type Static, t } from "elysia";
import { env } from "@/config/env";
import type { Clip } from "@/features/clips/db";
import { clipPublicIdSchema } from "@/features/clips/_shared/http/inputs";
import {
  recordingResponseSchema,
  toRecordingResponse
} from "@/features/recordings/_shared/http/responses";
import type { Recording } from "@/features/recordings/db";
import type { MediaRendition } from "@/features/media-renditions/db";
import { r2PublicUrl } from "@/shared/storage/r2";
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
  preview: t.Object({
    status: t.Union([
      t.Literal("pending"),
      t.Literal("ready"),
      t.Literal("failed")
    ]),
    posterStatus: t.Union([
      t.Literal("pending"),
      t.Literal("ready"),
      t.Literal("failed")
    ]),
    videoStatus: t.Union([
      t.Literal("pending"),
      t.Literal("ready"),
      t.Literal("failed")
    ]),
    posterUrl: t.Nullable(t.String()),
    videoUrl: t.Nullable(t.String()),
    width: t.Nullable(t.Integer({ minimum: 1 })),
    height: t.Nullable(t.Integer({ minimum: 1 })),
    durationTicks: t.Nullable(t.Integer({ minimum: 1 }))
  }),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const clipConfigurationResponseSchema = t.Object({
  maxDurationSeconds: t.Integer({ minimum: 1 }),
  maxDurationFrames: t.Integer({ minimum: 1 })
});

export const listClipsResponseSchema =
  paginatedResponseSchema(clipResponseSchema);

export type ClipResponse = Static<typeof clipResponseSchema>;
export type ClipConfigurationResponse = Static<
  typeof clipConfigurationResponseSchema
>;

export type ClipWithRecording = {
  clip: Clip;
  recording: Recording;
  renditions?: MediaRendition[];
};

export function toClipResponse({
  clip,
  recording,
  renditions = []
}: ClipWithRecording): ClipResponse {
  const poster = preferredRendition(renditions, "clip_poster");
  const video = preferredRendition(renditions, "clip_preview_video");
  const posterStatus = toPreviewStatus(poster);
  const videoStatus = toPreviewStatus(video);
  const status =
    posterStatus === "ready" && videoStatus === "ready"
      ? "ready"
      : posterStatus === "failed" && videoStatus === "failed"
        ? "failed"
        : "pending";

  return {
    id: clip.publicId,
    title: clip.title,
    startTick: clip.startTick,
    endTick: clip.endTick,
    durationTicks: clip.endTick - clip.startTick,
    sourceKind: clip.sourceKind,
    recording: toRecordingResponse(recording),
    preview: {
      status,
      posterStatus,
      videoStatus,
      posterUrl:
        poster?.status === "ready" && poster.objectKey
          ? r2PublicUrl(poster.objectKey)
          : null,
      videoUrl:
        video?.status === "ready" && video.objectKey
          ? r2PublicUrl(video.objectKey)
          : null,
      width: video?.width ?? poster?.width ?? null,
      height: video?.height ?? poster?.height ?? null,
      durationTicks: video?.durationTicks ?? poster?.durationTicks ?? null
    },
    createdAt: clip.createdAt,
    updatedAt: clip.updatedAt
  };
}

function preferredRendition(
  renditions: MediaRendition[],
  purpose: MediaRendition["purpose"]
): MediaRendition | undefined {
  const candidates = renditions
    .filter((rendition) => rendition.purpose === purpose)
    .sort(compareRenditions);
  const current = candidates.filter(
    (rendition) => rendition.profileVersion === env.mediaRendererVersion
  );
  const currentReady = current.filter(isReadyRendition).at(-1);
  const anyReady = candidates.filter(isReadyRendition).at(-1);

  return currentReady ?? anyReady ?? current.at(-1) ?? candidates.at(-1);
}

function compareRenditions(
  left: MediaRendition,
  right: MediaRendition
): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id - right.id;
}

function isReadyRendition(rendition: MediaRendition): boolean {
  return rendition.status === "ready" && Boolean(rendition.objectKey);
}

function toPreviewStatus(
  rendition: MediaRendition | undefined
): "pending" | "ready" | "failed" {
  if (rendition?.status === "ready" && rendition.objectKey) {
    return "ready";
  }
  if (rendition?.status === "failed") {
    return "failed";
  }
  return "pending";
}
