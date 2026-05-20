import { t } from "elysia";

const jobJsonSchema = t.Unknown();

export const jobStatusSchema = t.Union([
  t.Literal("queued"),
  t.Literal("running"),
  t.Literal("succeeded"),
  t.Literal("failed"),
  t.Literal("canceled")
]);

export const jobIdParamsSchema = t.Object({
  id: t.String({ format: "uuid" })
});

export { jobJsonSchema };
