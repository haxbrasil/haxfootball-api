import { t } from "elysia";

export const recordingPublicIdSchema = t.String({
  minLength: 7,
  maxLength: 64,
  pattern: "^[a-f0-9]+$"
});

export const recordingPublicIdParamsSchema = t.Object({
  id: recordingPublicIdSchema
});
