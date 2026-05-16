import { describe, expect, it } from "bun:test";
import {
  enqueueRoomReconciliationJobForTest,
  ensureJobScheduleForTest,
  runRoomReconciliationJobForTest
} from "@/test/e2e/helpers/jobs";
import { paginatedBody, request } from "@/test/e2e/helpers/helpers";

type JobListItem = {
  id: string;
  type: string;
  status: string;
};

type JobDetail = JobListItem & {
  result?: unknown;
  error?: unknown;
  attempts: number;
  maxAttempts: number;
  lockedAt: string | null;
  lockedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobScheduleItem = {
  id: string;
  key: string;
  type: string;
  intervalSeconds: number;
  enabled: boolean;
  nextRunAt: string;
  lastEnqueuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

describe("jobs API", () => {
  it("lists jobs with cursor pagination and no duplicates", async () => {
    const firstJobId = await enqueueRoomReconciliationJobForTest();
    const secondJobId = await enqueueRoomReconciliationJobForTest();

    const response = await request("/api/jobs?limit=1");

    expect(response.status).toBe(200);

    const body = await paginatedBody<JobListItem>(response);

    expect(body.page.limit).toBe(1);
    expect(body.items).toEqual([
      expect.objectContaining({
        id: secondJobId,
        type: "rooms.reconcile-open",
        status: "queued"
      })
    ]);
    expect(body.page.nextCursor).toEqual(expect.any(String));

    const secondResponse = await request(
      `/api/jobs?limit=1&cursor=${body.page.nextCursor}`
    );

    expect(secondResponse.status).toBe(200);

    const secondBody = await paginatedBody<JobListItem>(secondResponse);

    expect(secondBody.items).toEqual([
      expect.objectContaining({
        id: firstJobId,
        type: "rooms.reconcile-open",
        status: "queued"
      })
    ]);
  });

  it("gets a queued job by ID", async () => {
    const jobId = await enqueueRoomReconciliationJobForTest();
    const response = await request(`/api/jobs/${jobId}`);

    expect(response.status).toBe(200);

    const body: JobDetail = await response.json();

    expect(body).toMatchObject({
      id: jobId,
      type: "rooms.reconcile-open",
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      finishedAt: null
    });
    expect(body.createdAt).toEqual(expect.any(String));
    expect(body.updatedAt).toEqual(expect.any(String));
  });

  it("gets a completed job with persisted result and timestamps", async () => {
    const jobId = await runRoomReconciliationJobForTest();
    const response = await request(`/api/jobs/${jobId}`);

    expect(response.status).toBe(200);

    const body: JobDetail = await response.json();

    expect(body).toMatchObject({
      id: jobId,
      type: "rooms.reconcile-open",
      status: "succeeded",
      attempts: 1,
      maxAttempts: 3,
      result: {
        inspected: expect.any(Number),
        closed: expect.any(Number),
        failed: expect.any(Number),
        externalMarkedRunning: expect.any(Number),
        staleClosed: expect.any(Number)
      },
      error: null,
      lockedAt: null,
      lockedBy: null,
      startedAt: expect.any(String),
      finishedAt: expect.any(String)
    });
  });

  it("returns 404 for an unknown job", async () => {
    const response = await request(`/api/jobs/${crypto.randomUUID()}`);

    expect(response.status).toBe(404);
  });

  it("lists job schedules with cursor pagination and configured contents", async () => {
    const scheduleId = await ensureJobScheduleForTest();

    const response = await request("/api/job-schedules?limit=1");

    expect(response.status).toBe(200);

    const body = await paginatedBody<JobScheduleItem>(response);

    expect(body.page.limit).toBe(1);
    expect(body.items).toEqual([
      expect.objectContaining({
        id: scheduleId,
        key: "rooms.reconcile-open",
        type: "rooms.reconcile-open",
        intervalSeconds: 30,
        enabled: true,
        nextRunAt: expect.any(String),
        lastEnqueuedAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      })
    ]);
  });

  it("gets a job schedule by ID", async () => {
    const scheduleId = await ensureJobScheduleForTest();
    const response = await request(`/api/job-schedules/${scheduleId}`);

    expect(response.status).toBe(200);

    const body: JobScheduleItem = await response.json();

    expect(body).toMatchObject({
      id: scheduleId,
      key: "rooms.reconcile-open",
      type: "rooms.reconcile-open",
      intervalSeconds: 30,
      enabled: true,
      nextRunAt: expect.any(String),
      lastEnqueuedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
  });

  it("returns 404 for an unknown job schedule", async () => {
    const response = await request(`/api/job-schedules/${crypto.randomUUID()}`);

    expect(response.status).toBe(404);
  });

  it("does not expose mutating job HTTP routes", async () => {
    const jobId = await enqueueRoomReconciliationJobForTest();
    const scheduleId = await ensureJobScheduleForTest();
    const responses = await Promise.all([
      request("/api/jobs", {
        method: "POST",
        body: {
          type: "rooms.reconcile-open"
        }
      }),
      request(`/api/jobs/${jobId}/retry`, {
        method: "POST"
      }),
      request(`/api/job-schedules/${scheduleId}`, {
        method: "PATCH",
        body: {
          enabled: false
        }
      })
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404
    ]);
  });
});
