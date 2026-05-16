import { env } from "@/config/env";
import {
  ensureConfiguredJobSchedules,
  enqueueDueJobSchedules,
  recoverAbandonedJobLocks,
  runNextDueJob,
  runnerId
} from "@/features/jobs/job.service";
import { sleep } from "@lib/timing";

export async function workJobs(): Promise<void> {
  if (!env.jobRunnerEnabled) {
    console.log(JSON.stringify({ event: "jobs.disabled" }));
    return;
  }

  const id = runnerId();
  const abortController = new AbortController();
  const stop = () => abortController.abort();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await ensureConfiguredJobSchedules();
  await recoverAbandonedJobLocks();

  console.log(JSON.stringify({ event: "jobs.started", runnerId: id }));

  await workUntilStopped(id, abortController.signal);

  console.log(JSON.stringify({ event: "jobs.stopped", runnerId: id }));
}

async function workUntilStopped(
  id: string,
  signal: AbortSignal
): Promise<void> {
  while (!signal.aborted) {
    await enqueueDueJobSchedules();

    const job = await runNextDueJob({ runnerId: id });
    const waitForNextPoll = job
      ? Promise.resolve()
      : sleep(env.jobPollIntervalSeconds * 1000, { signal });

    await waitForNextPoll;
  }
}
