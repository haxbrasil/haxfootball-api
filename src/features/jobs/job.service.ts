import { env } from "@/config/env";
import type { Job } from "@/features/jobs/job.db";
import {
  claimNextDueJob,
  claimQueuedJobByUuid,
  insertJob,
  listDueJobSchedules,
  markJobFailedOrRetry,
  markJobSucceeded,
  markScheduleEnqueued,
  recoverAbandonedJobs,
  upsertJobSchedule
} from "@/features/jobs/job.persistence";
import { reconcileOpenRooms } from "@/features/rooms/reconcile-rooms";
import { badRequest } from "@/shared/http/errors";
import type { JsonValue } from "@lib/json";

export const roomReconcileJobType = "rooms.reconcile-open";
const defaultMaxAttempts = 3;

export type JobHandler = (
  payload: JsonValue | null
) => Promise<JsonValue | undefined>;

export type JobHandlerRegistry = Readonly<Record<string, JobHandler>>;

export const defaultJobHandlers = {
  [roomReconcileJobType]: async () => reconcileOpenRooms()
} satisfies JobHandlerRegistry;

export function assertKnownJobType(
  type: string,
  handlers: JobHandlerRegistry = defaultJobHandlers
): void {
  if (!(type in handlers)) {
    throw badRequest(`Unknown job type: ${type}`);
  }
}

export async function enqueueKnownJob(input: {
  type: string;
  payload?: JsonValue;
  maxAttempts?: number;
  runAfter?: Date;
  handlers?: JobHandlerRegistry;
}): Promise<Job> {
  assertKnownJobType(input.type, input.handlers);

  return insertJob({
    ...input,
    maxAttempts: input.maxAttempts ?? defaultMaxAttempts
  });
}

export async function runNextDueJob(input: {
  runnerId: string;
  now?: Date;
  handlers?: JobHandlerRegistry;
}): Promise<Job | null> {
  const claimed = await claimNextDueJob(input);

  if (!claimed) {
    return null;
  }

  return runClaimedJob({
    job: claimed,
    now: input.now,
    handlers: input.handlers ?? defaultJobHandlers
  });
}

export async function runQueuedJob(input: {
  uuid: string;
  runnerId: string;
  now?: Date;
  handlers?: JobHandlerRegistry;
}): Promise<Job | null> {
  const claimed = await claimQueuedJobByUuid(input);

  if (!claimed) {
    return null;
  }

  return runClaimedJob({
    job: claimed,
    now: input.now,
    handlers: input.handlers ?? defaultJobHandlers
  });
}

async function runClaimedJob(input: {
  job: Job;
  now: Date | undefined;
  handlers: JobHandlerRegistry;
}): Promise<Job> {
  const handler = input.handlers[input.job.type];

  if (!handler) {
    return markJobFailedOrRetry({
      job: input.job,
      error: {
        message: `Unknown job type: ${input.job.type}`
      },
      now: input.now
    });
  }

  console.log(
    JSON.stringify({
      event: "job.started",
      jobId: input.job.uuid,
      type: input.job.type,
      attempts: input.job.attempts
    })
  );

  try {
    const result = await handler(input.job.payload ?? null);
    const completed = await markJobSucceeded({
      jobId: input.job.id,
      result: result ?? null,
      now: input.now
    });

    console.log(
      JSON.stringify({
        event: "job.succeeded",
        jobId: completed.uuid,
        type: completed.type,
        attempts: completed.attempts
      })
    );

    return completed;
  } catch (error) {
    const serializedError = serializeJobError(error);
    const failedOrRetrying = await markJobFailedOrRetry({
      job: input.job,
      error: serializedError,
      now: input.now
    });
    const event =
      failedOrRetrying.status === "queued" ? "job.retrying" : "job.failed";

    console.log(
      JSON.stringify({
        event,
        jobId: failedOrRetrying.uuid,
        type: failedOrRetrying.type,
        attempts: failedOrRetrying.attempts,
        error: serializedError
      })
    );

    return failedOrRetrying;
  }
}

export async function enqueueDueJobSchedules(
  now = new Date(),
  handlers: JobHandlerRegistry = defaultJobHandlers
): Promise<Job[]> {
  const schedules = await listDueJobSchedules(now);

  const enqueuedJobs = await Promise.all(
    schedules.map(async (schedule) => {
      assertKnownJobType(schedule.type, handlers);
      const updatedSchedule = await markScheduleEnqueued({ schedule, now });

      if (!updatedSchedule) {
        return null;
      }

      const job = await insertJob({
        type: schedule.type,
        payload: schedule.payload ?? undefined,
        maxAttempts: defaultMaxAttempts,
        runAfter: now
      });

      console.log(
        JSON.stringify({
          event: "job_schedule.enqueued",
          scheduleId: schedule.uuid,
          jobId: job.uuid,
          type: job.type
        })
      );

      return job;
    })
  );

  return enqueuedJobs.filter((job): job is Job => job !== null);
}

export async function recoverAbandonedJobLocks(now = new Date()): Promise<{
  requeued: number;
  failed: number;
}> {
  const result = await recoverAbandonedJobs({
    lockTimeoutSeconds: env.jobLockTimeoutSeconds,
    now
  });

  if (result.requeued > 0 || result.failed > 0) {
    console.log(
      JSON.stringify({
        event: "jobs.abandoned_recovered",
        requeued: result.requeued,
        failed: result.failed
      })
    );
  }

  return result;
}

export async function ensureConfiguredJobSchedules(
  now = new Date()
): Promise<void> {
  await upsertJobSchedule({
    key: roomReconcileJobType,
    type: roomReconcileJobType,
    intervalSeconds: Math.max(env.roomReconcileIntervalSeconds, 1),
    enabled: env.roomReconcileIntervalSeconds > 0,
    nextRunAt: now
  });
}

export function runnerId(): string {
  return (
    env.jobRunnerId ??
    `${process.env.HOSTNAME ?? "localhost"}:${process.pid.toString()}`
  );
}

function serializeJobError(error: unknown): JsonValue {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    };
  }

  return {
    message: String(error)
  };
}
