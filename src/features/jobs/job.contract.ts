import { type Static, t } from "elysia";
import type { Job, JobSchedule } from "@/features/jobs/job.db";
import { paginatedResponseSchema } from "@lib";

const jobJsonSchema = t.Unknown();

export const jobStatusSchema = t.Union([
  t.Literal("queued"),
  t.Literal("running"),
  t.Literal("succeeded"),
  t.Literal("failed"),
  t.Literal("canceled")
]);

export const jobResponseSchema = t.Object({
  id: t.String({ format: "uuid" }),
  type: t.String(),
  status: jobStatusSchema,
  payload: t.Optional(jobJsonSchema),
  result: t.Optional(jobJsonSchema),
  error: t.Optional(jobJsonSchema),
  attempts: t.Integer(),
  maxAttempts: t.Integer(),
  runAfter: t.String(),
  lockedAt: t.Nullable(t.String()),
  lockedBy: t.Nullable(t.String()),
  startedAt: t.Nullable(t.String()),
  finishedAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listJobsResponseSchema =
  paginatedResponseSchema(jobResponseSchema);

export const jobScheduleResponseSchema = t.Object({
  id: t.String({ format: "uuid" }),
  key: t.String(),
  type: t.String(),
  payload: t.Optional(jobJsonSchema),
  intervalSeconds: t.Integer(),
  enabled: t.Boolean(),
  nextRunAt: t.String(),
  lastEnqueuedAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listJobSchedulesResponseSchema = paginatedResponseSchema(
  jobScheduleResponseSchema
);

export const jobIdParamsSchema = t.Object({
  id: t.String({ format: "uuid" })
});

export type JobResponse = Static<typeof jobResponseSchema>;
export type JobScheduleResponse = Static<typeof jobScheduleResponseSchema>;

export function toJobResponse(job: Job): JobResponse {
  return {
    id: job.uuid,
    type: job.type,
    status: job.status,
    payload: job.payload,
    result: job.result,
    error: job.error,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAfter: job.runAfter,
    lockedAt: job.lockedAt,
    lockedBy: job.lockedBy,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

export function toJobScheduleResponse(
  schedule: JobSchedule
): JobScheduleResponse {
  return {
    id: schedule.uuid,
    key: schedule.key,
    type: schedule.type,
    payload: schedule.payload,
    intervalSeconds: schedule.intervalSeconds,
    enabled: schedule.enabled,
    nextRunAt: schedule.nextRunAt,
    lastEnqueuedAt: schedule.lastEnqueuedAt,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt
  };
}
