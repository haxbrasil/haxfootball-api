import { env } from "@/config/env";
import { mediaJobHandlers } from "@/features/media-renditions/render";
import { purgeExpiredClipExports } from "@/features/media-renditions/expire-exports";
import {
  recoverAbandonedJobLocks,
  runNextDueJob
} from "@/features/jobs/_shared/domain/execution";
import { sleep } from "@lib/timing";

export async function workMediaJobs(): Promise<void> {
  if (!env.mediaWorkerEnabled) {
    console.log(JSON.stringify({ event: "media_jobs.disabled" }));
    return;
  }

  const id =
    env.mediaWorkerId ??
    `${process.env.HOSTNAME ?? "localhost"}:media:${process.pid.toString()}`;
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await recoverAbandonedJobLocks(new Date(), "media");
  console.log(JSON.stringify({ event: "media_jobs.started", runnerId: id }));

  while (!abortController.signal.aborted) {
    await purgeExpiredClipExports();
    const job = await runNextDueJob({
      runnerId: id,
      queue: "media",
      handlers: mediaJobHandlers
    });
    if (!job) {
      await sleep(env.mediaWorkerPollIntervalSeconds * 1000, {
        signal: abortController.signal
      });
    }
  }

  console.log(JSON.stringify({ event: "media_jobs.stopped", runnerId: id }));
}
