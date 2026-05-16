import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  jobs,
  jobSchedules,
  type Job,
  type JobSchedule
} from "@/features/jobs/job.db";
import { badRequest, notFound } from "@/shared/http/errors";
import type { JsonValue } from "@lib/json";
import { cursorAfter, cursorSort, pageLimit, type PaginationQuery } from "@lib";

export type EnqueueJobInput = {
  type: string;
  payload?: JsonValue;
  maxAttempts: number;
  runAfter?: Date;
};

export async function insertJob(input: EnqueueJobInput): Promise<Job> {
  const now = new Date().toISOString();
  const [job] = await db
    .insert(jobs)
    .values({
      uuid: crypto.randomUUID(),
      type: input.type,
      status: "queued",
      payload: input.payload,
      attempts: 0,
      maxAttempts: input.maxAttempts,
      runAfter: (input.runAfter ?? new Date()).toISOString(),
      createdAt: now,
      updatedAt: now
    })
    .returning();

  return job;
}

export async function listJobRows(query: PaginationQuery = {}): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(cursorAfter(jobs.id, query.cursor, "desc"))
    .orderBy(cursorSort(jobs.id, "desc"))
    .limit(pageLimit(query));
}

export async function getJobByUuid(uuid: string): Promise<Job> {
  const [job] = await db.select().from(jobs).where(eq(jobs.uuid, uuid));

  if (!job) {
    throw notFound("Job not found");
  }

  return job;
}

export async function claimNextDueJob(input: {
  runnerId: string;
  now?: Date;
}): Promise<Job | null> {
  const now = input.now ?? new Date();
  const [candidate] = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.status, "queued"), lte(jobs.runAfter, now.toISOString()))
    )
    .orderBy(asc(jobs.runAfter), asc(jobs.createdAt), asc(jobs.id))
    .limit(1);

  if (!candidate) {
    return null;
  }

  const startedAt = now.toISOString();
  const [claimed] = await db
    .update(jobs)
    .set({
      status: "running",
      attempts: sql`${jobs.attempts} + 1`,
      lockedAt: startedAt,
      lockedBy: input.runnerId,
      startedAt,
      finishedAt: null,
      updatedAt: startedAt
    })
    .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "queued")))
    .returning();

  return claimed ?? null;
}

export async function claimQueuedJobByUuid(input: {
  uuid: string;
  runnerId: string;
  now?: Date;
}): Promise<Job | null> {
  const now = input.now ?? new Date();
  const startedAt = now.toISOString();
  const [claimed] = await db
    .update(jobs)
    .set({
      status: "running",
      attempts: sql`${jobs.attempts} + 1`,
      lockedAt: startedAt,
      lockedBy: input.runnerId,
      startedAt,
      finishedAt: null,
      updatedAt: startedAt
    })
    .where(and(eq(jobs.uuid, input.uuid), eq(jobs.status, "queued")))
    .returning();

  return claimed ?? null;
}

export async function markJobSucceeded(input: {
  jobId: number;
  result?: JsonValue;
  now?: Date;
}): Promise<Job> {
  const now = (input.now ?? new Date()).toISOString();
  const [job] = await db
    .update(jobs)
    .set({
      status: "succeeded",
      result: input.result ?? null,
      error: null,
      lockedAt: null,
      lockedBy: null,
      finishedAt: now,
      updatedAt: now
    })
    .where(eq(jobs.id, input.jobId))
    .returning();

  return job;
}

export async function markJobFailedOrRetry(input: {
  job: Job;
  error: JsonValue;
  now?: Date;
}): Promise<Job> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  if (input.job.attempts < input.job.maxAttempts) {
    const retryDelaySeconds = Math.min(input.job.attempts * 5, 60);
    const runAfter = new Date(
      now.getTime() + retryDelaySeconds * 1000
    ).toISOString();
    const [job] = await db
      .update(jobs)
      .set({
        status: "queued",
        error: input.error,
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        finishedAt: null,
        runAfter,
        updatedAt: nowIso
      })
      .where(eq(jobs.id, input.job.id))
      .returning();

    return job;
  }

  const [job] = await db
    .update(jobs)
    .set({
      status: "failed",
      error: input.error,
      lockedAt: null,
      lockedBy: null,
      finishedAt: nowIso,
      updatedAt: nowIso
    })
    .where(eq(jobs.id, input.job.id))
    .returning();

  return job;
}

export async function retryFailedJob(uuid: string): Promise<Job> {
  const job = await getJobByUuid(uuid);

  if (job.status !== "failed") {
    throw badRequest("Only failed jobs can be retried");
  }

  const now = new Date().toISOString();
  const [updated] = await db
    .update(jobs)
    .set({
      status: "queued",
      attempts: 0,
      result: null,
      error: null,
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      finishedAt: null,
      runAfter: now,
      updatedAt: now
    })
    .where(eq(jobs.id, job.id))
    .returning();

  return updated;
}

export async function recoverAbandonedJobs(input: {
  lockTimeoutSeconds: number;
  now?: Date;
}): Promise<{ requeued: number; failed: number }> {
  const now = input.now ?? new Date();
  const cutoff = new Date(
    now.getTime() - input.lockTimeoutSeconds * 1000
  ).toISOString();
  const abandonedJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "running"), lte(jobs.lockedAt, cutoff)));

  const recoveredJobs = await Promise.all(
    abandonedJobs.map(async (job) => {
      const status = job.attempts < job.maxAttempts ? "requeued" : "failed";
      const error = {
        message: "Job lock was abandoned",
        lockedAt: job.lockedAt,
        lockedBy: job.lockedBy
      };

      await markJobFailedOrRetry({ job, error, now });

      return status;
    })
  );

  return {
    requeued: recoveredJobs.filter((status) => status === "requeued").length,
    failed: recoveredJobs.filter((status) => status === "failed").length
  };
}

export async function upsertJobSchedule(input: {
  key: string;
  type: string;
  payload?: JsonValue;
  intervalSeconds: number;
  enabled: boolean;
  nextRunAt?: Date;
}): Promise<JobSchedule> {
  const existing = await getJobScheduleByKey(input.key);
  const now = new Date().toISOString();
  const nextRunAt = (input.nextRunAt ?? new Date()).toISOString();

  if (!existing) {
    const [schedule] = await db
      .insert(jobSchedules)
      .values({
        uuid: crypto.randomUUID(),
        key: input.key,
        type: input.type,
        payload: input.payload,
        intervalSeconds: input.intervalSeconds,
        enabled: input.enabled,
        nextRunAt,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return schedule;
  }

  const [schedule] = await db
    .update(jobSchedules)
    .set({
      type: input.type,
      payload: input.payload,
      intervalSeconds: input.intervalSeconds,
      enabled: input.enabled,
      nextRunAt: input.enabled ? existing.nextRunAt : nextRunAt,
      updatedAt: now
    })
    .where(eq(jobSchedules.id, existing.id))
    .returning();

  return schedule;
}

export async function listDueJobSchedules(
  now = new Date()
): Promise<JobSchedule[]> {
  return db
    .select()
    .from(jobSchedules)
    .where(
      and(
        eq(jobSchedules.enabled, true),
        lte(jobSchedules.nextRunAt, now.toISOString())
      )
    )
    .orderBy(asc(jobSchedules.nextRunAt), asc(jobSchedules.id));
}

export async function markScheduleEnqueued(input: {
  schedule: JobSchedule;
  now?: Date;
}): Promise<JobSchedule | null> {
  const now = input.now ?? new Date();
  const nextRunAt = new Date(
    now.getTime() + input.schedule.intervalSeconds * 1000
  ).toISOString();
  const nowIso = now.toISOString();
  const [updated] = await db
    .update(jobSchedules)
    .set({
      nextRunAt,
      lastEnqueuedAt: nowIso,
      updatedAt: nowIso
    })
    .where(
      and(
        eq(jobSchedules.id, input.schedule.id),
        eq(jobSchedules.nextRunAt, input.schedule.nextRunAt)
      )
    )
    .returning();

  return updated ?? null;
}

export async function listJobScheduleRows(
  query: PaginationQuery = {}
): Promise<JobSchedule[]> {
  return db
    .select()
    .from(jobSchedules)
    .where(cursorAfter(jobSchedules.id, query.cursor, "asc"))
    .orderBy(cursorSort(jobSchedules.id, "asc"))
    .limit(pageLimit(query));
}

export async function getJobScheduleByUuid(uuid: string): Promise<JobSchedule> {
  const [schedule] = await db
    .select()
    .from(jobSchedules)
    .where(eq(jobSchedules.uuid, uuid));

  if (!schedule) {
    throw notFound("Job schedule not found");
  }

  return schedule;
}

async function getJobScheduleByKey(key: string): Promise<JobSchedule | null> {
  const [schedule] = await db
    .select()
    .from(jobSchedules)
    .where(eq(jobSchedules.key, key));

  return schedule ?? null;
}
