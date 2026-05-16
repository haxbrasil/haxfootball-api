import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { setupInternalTestDatabase } from "@/test/internal/helpers/database";

beforeAll(async () => {
  await setupInternalTestDatabase();
});

describe("job internals", () => {
  it("enqueues and claims only due queued jobs", async () => {
    const { getJobByUuid } = await import("@/features/jobs/job.persistence");
    const { enqueueKnownJob, runNextDueJob } = await import(
      "@/features/jobs/job.service"
    );

    const type = `test.due-${crypto.randomUUID()}`;
    const handlers = {
      [type]: async () => ({ ok: true })
    };

    const futureJob = await enqueueKnownJob({
      type,
      runAfter: new Date(Date.now() + 60_000),
      handlers
    });
    const dueJob = await enqueueKnownJob({ type, handlers });

    const completed = await runNextDueJob({
      runnerId: "test-runner",
      handlers
    });
    const reloadedFutureJob = await getJobByUuid(futureJob.uuid);

    expect(completed).toMatchObject({
      uuid: dueJob.uuid,
      status: "succeeded",
      attempts: 1,
      result: { ok: true }
    });
    expect(reloadedFutureJob).toMatchObject({
      status: "queued",
      attempts: 0
    });
  });

  it("does not double-claim a running job", async () => {
    const { enqueueKnownJob } = await import("@/features/jobs/job.service");
    const { claimNextDueJob, markJobSucceeded } = await import(
      "@/features/jobs/job.persistence"
    );

    const type = `test.claim-${crypto.randomUUID()}`;
    const handlers = {
      [type]: async () => ({ ok: true })
    };
    const enqueued = await enqueueKnownJob({ type, handlers });

    const firstClaim = await claimNextDueJob({ runnerId: "runner-a" });
    const secondClaim = await claimNextDueJob({ runnerId: "runner-b" });

    expect(firstClaim).toMatchObject({
      uuid: enqueued.uuid,
      status: "running",
      attempts: 1,
      lockedBy: "runner-a"
    });
    expect(secondClaim).toBeNull();

    if (firstClaim) {
      await markJobSucceeded({ jobId: firstClaim.id });
    }
  });

  it("requeues failing jobs until attempts are exhausted", async () => {
    const { enqueueKnownJob, runNextDueJob } = await import(
      "@/features/jobs/job.service"
    );

    const type = `test.fail-${crypto.randomUUID()}`;
    const handlers = {
      [type]: async () => {
        throw new Error("planned failure");
      }
    };
    const enqueued = await enqueueKnownJob({ type, maxAttempts: 2, handlers });

    const retrying = await runNextDueJob({ runnerId: "test-runner", handlers });
    const failed = await runNextDueJob({
      runnerId: "test-runner",
      now: new Date(Date.now() + 6000),
      handlers
    });

    expect(retrying).toMatchObject({
      uuid: enqueued.uuid,
      status: "queued",
      attempts: 1
    });
    expect(failed).toMatchObject({
      uuid: enqueued.uuid,
      status: "failed",
      attempts: 2,
      error: {
        name: "Error",
        message: "planned failure"
      }
    });
  });

  it("recovers abandoned running jobs", async () => {
    const { db } = await import("@/db/client");
    const { jobs } = await import("@/features/jobs/job.db");
    const { recoverAbandonedJobs } = await import(
      "@/features/jobs/job.persistence"
    );

    const now = new Date(Date.now() + 3_600_000);
    const oldLock = new Date(now.getTime() - 600_000).toISOString();
    const [retryable] = await db
      .insert(jobs)
      .values({
        uuid: crypto.randomUUID(),
        type: "test.abandoned-retry",
        status: "running",
        attempts: 1,
        maxAttempts: 2,
        runAfter: oldLock,
        lockedAt: oldLock,
        lockedBy: "gone",
        startedAt: oldLock,
        createdAt: oldLock,
        updatedAt: oldLock
      })
      .returning();
    const [exhausted] = await db
      .insert(jobs)
      .values({
        uuid: crypto.randomUUID(),
        type: "test.abandoned-fail",
        status: "running",
        attempts: 2,
        maxAttempts: 2,
        runAfter: oldLock,
        lockedAt: oldLock,
        lockedBy: "gone",
        startedAt: oldLock,
        createdAt: oldLock,
        updatedAt: oldLock
      })
      .returning();

    const result = await recoverAbandonedJobs({
      lockTimeoutSeconds: 60,
      now
    });
    const [requeued] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, retryable.id));
    const [failed] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, exhausted.id));

    expect(result).toEqual({ requeued: 1, failed: 1 });
    expect(requeued).toMatchObject({
      status: "queued",
      lockedAt: null,
      lockedBy: null
    });
    expect(failed).toMatchObject({
      status: "failed",
      lockedAt: null,
      lockedBy: null
    });
  });

  it("enqueues each due schedule window once", async () => {
    const { upsertJobSchedule } = await import(
      "@/features/jobs/job.persistence"
    );
    const { enqueueDueJobSchedules, runNextDueJob } = await import(
      "@/features/jobs/job.service"
    );

    const type = `test.schedule-${crypto.randomUUID()}`;
    const now = new Date("2026-05-16T12:00:00.000Z");
    const handlers = {
      [type]: async () => ({ ok: true })
    };
    await upsertJobSchedule({
      key: type,
      type,
      intervalSeconds: 30,
      enabled: true,
      nextRunAt: now
    });

    const first = await enqueueDueJobSchedules(now, handlers);
    const second = await enqueueDueJobSchedules(now, handlers);
    const completed = await runNextDueJob({
      runnerId: "test-runner",
      now,
      handlers
    });

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type, status: "queued" });
    expect(second).toHaveLength(0);
    expect(completed).toMatchObject({
      uuid: first[0].uuid,
      status: "succeeded"
    });
  });

  it("runs room reconciliation through a job and stores the summary", async () => {
    const { db } = await import("@/db/client");
    const { jobs } = await import("@/features/jobs/job.db");
    const { enqueueKnownJob, roomReconcileJobType, runNextDueJob } =
      await import("@/features/jobs/job.service");
    const { roomInstances, roomPrograms, roomProgramVersions } = await import(
      "@/features/rooms/room.db"
    );

    const [program] = await db
      .insert(roomPrograms)
      .values({
        uuid: crypto.randomUUID(),
        name: `job-reconcile-${crypto.randomUUID().slice(0, 8)}`,
        title: "Job reconcile",
        description: "Job reconcile",
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [],
        integrationMode: "external",
        haxballTokenEnvVar: "ROOM_TOKEN"
      })
      .returning();
    const [version] = await db
      .insert(roomProgramVersions)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        version: `job-reconcile-${crypto.randomUUID().slice(0, 8)}`,
        artifact: {
          releaseId: "job-reconcile",
          tagName: "job-reconcile",
          assetName: "room-job-reconcile.tgz",
          assetUrl: "https://example.com/room-job-reconcile.tgz",
          publishedAt: "2026-05-15T00:00:00.000Z"
        },
        entrypoint: "dist/server.js",
        installStrategy: "none"
      })
      .returning();
    await db.insert(roomInstances).values({
      uuid: crypto.randomUUID(),
      programId: program.id,
      versionId: version.id,
      state: "running",
      roomLink: null,
      launchConfig: {},
      public: false,
      commIdHash: "job-reconcile",
      createdAt: "2026-05-16T11:00:00.000Z",
      updatedAt: "2026-05-16T11:00:00.000Z"
    });

    const enqueued = await enqueueKnownJob({ type: roomReconcileJobType });
    const completed = await runNextDueJob({ runnerId: "test-runner" });
    const [stored] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.uuid, enqueued.uuid));

    expect(completed).toMatchObject({
      uuid: enqueued.uuid,
      status: "succeeded"
    });
    expect(stored.result).toMatchObject({
      inspected: expect.any(Number),
      closed: expect.any(Number),
      failed: expect.any(Number),
      externalMarkedRunning: expect.any(Number),
      staleClosed: expect.any(Number)
    });
  });
});
