import { type Static, t } from "elysia";
import { recordingPublicIdSchema } from "@/features/recordings/_shared/http/inputs";

const clipTickSchema = t.Integer({ minimum: 0, maximum: 2_147_483_647 });

export const clipPublicIdSchema = t.String({ format: "uuid" });

export const clipPublicIdParamsSchema = t.Object({
  id: clipPublicIdSchema
});

export const listClipsQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  recordingId: t.Optional(recordingPublicIdSchema)
});

export const createClipBodySchema = t.Object({
  recordingId: recordingPublicIdSchema,
  startTick: clipTickSchema,
  endTick: t.Integer({ minimum: 1, maximum: 2_147_483_647 }),
  title: t.Optional(t.String({ maxLength: 120 }))
});

export const updateClipBodySchema = t.Object({
  startTick: t.Optional(clipTickSchema),
  endTick: t.Optional(t.Integer({ minimum: 1, maximum: 2_147_483_647 })),
  title: t.Optional(t.Nullable(t.String({ maxLength: 120 })))
});

export type ListClipsQuery = Static<typeof listClipsQuerySchema>;
export type CreateClipInput = Static<typeof createClipBodySchema>;
export type UpdateClipInput = Static<typeof updateClipBodySchema>;

const clipExportFormatSchema = t.Union([
  t.Literal("mp4"),
  t.Literal("webm"),
  t.Literal("gif")
]);
const clipExportOrientationSchema = t.Union([
  t.Literal("landscape"),
  t.Literal("vertical")
]);
const clipExportScoreboardSchema = t.Union([
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
]);

export const createClipExportBodySchema = t.Object({
  format: clipExportFormatSchema,
  orientation: clipExportOrientationSchema,
  scoreboard: clipExportScoreboardSchema,
  cameraId: t.String({ minLength: 1, maxLength: 80 }),
  renderProfileVersionId: t.String({ format: "uuid" })
});

export type CreateClipExportInput = Static<typeof createClipExportBodySchema>;
