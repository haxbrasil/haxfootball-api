import { type Static, t } from "elysia";
import type { Clip } from "@/features/clips/db";
import { clipPublicIdSchema } from "@/features/clips/_shared/http/inputs";
import {
  recordingResponseSchema,
  toRecordingResponse
} from "@/features/recordings/_shared/http/responses";
import type { Recording } from "@/features/recordings/db";
import type { MediaRendition } from "@/features/media-renditions/db";
import { mediaRenditionProfileVersion } from "@/features/media-renditions/_shared/domain/jobs";
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

const clipExportStatusSchema = t.Union([
  t.Literal("queued"),
  t.Literal("running"),
  t.Literal("ready"),
  t.Literal("failed"),
  t.Literal("expired")
]);
export const clipExportProfileSchema = t.Object({
  format: t.Union([t.Literal("mp4"), t.Literal("webm"), t.Literal("gif")]),
  orientation: t.Union([t.Literal("landscape"), t.Literal("vertical")]),
  scoreboard: t.Union([
    t.Literal("default"),
    t.Literal("compact"),
    t.Literal("score-only"),
    t.Literal("time-only"),
    t.Literal("floating-default"),
    t.Literal("floating-compact"),
    t.Literal("floating-score-only"),
    t.Literal("floating-time-only"),
    t.Literal("floating-score-time-right"),
    t.Literal("none")
  ]),
  renderProfileVersionId: t.Optional(t.String())
});
export const clipExportResponseSchema = t.Object({
  id: t.String(),
  profile: clipExportProfileSchema,
  status: clipExportStatusSchema,
  url: t.Nullable(t.String()),
  expiresAt: t.Nullable(t.String()),
  width: t.Nullable(t.Integer({ minimum: 1 })),
  height: t.Nullable(t.Integer({ minimum: 1 })),
  sizeBytes: t.Nullable(t.Integer({ minimum: 1 })),
  createdAt: t.String(),
  updatedAt: t.String()
});
export const listClipExportsResponseSchema = t.Object({
  items: t.Array(clipExportResponseSchema)
});
export const clipExportCapabilitiesResponseSchema = t.Object({
  ttlSeconds: t.Integer({ minimum: 1 }),
  formats: t.Array(t.String()),
  orientations: t.Array(t.String()),
  scoreboards: t.Array(t.String()),
  renderProfiles: t.Array(
    t.Object({
      id: t.String(),
      title: t.String(),
      description: t.Nullable(t.String()),
      version: t.Integer(),
      formats: t.Array(t.String()),
      orientations: t.Array(t.String()),
      scoreboards: t.Array(t.String())
    })
  )
});
export type ClipExportResponse = Static<typeof clipExportResponseSchema>;

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
    (rendition) =>
      rendition.profileVersion === mediaRenditionProfileVersion(purpose)
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

export function toClipExportResponse(
  rendition: MediaRendition
): ClipExportResponse {
  if (rendition.purpose !== "clip_export" || !rendition.exportProfile) {
    throw new Error("Rendition is not a clip export");
  }
  const expired =
    rendition.status === "expired" ||
    (rendition.expiresAt !== null &&
      rendition.expiresAt <= new Date().toISOString());
  return {
    id: rendition.uuid,
    profile: rendition.exportProfile,
    status: expired ? "expired" : rendition.status,
    url:
      !expired && rendition.status === "ready" && rendition.objectKey
        ? r2PublicUrl(rendition.objectKey)
        : null,
    expiresAt: rendition.expiresAt,
    width: rendition.width,
    height: rendition.height,
    sizeBytes: rendition.sizeBytes,
    createdAt: rendition.createdAt,
    updatedAt: rendition.updatedAt
  };
}
