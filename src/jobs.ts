import { Command, InvalidArgumentError } from "commander";
import type { JsonValue } from "@lib/json";
import { parseJsonValue } from "@lib/json";
import { HttpError } from "@/shared/http/errors";

const program = new Command()
  .name("jobs")
  .description("Operate HaxFootball API background jobs")
  .showHelpAfterError();

program
  .command("work")
  .description("Run the long-lived job runner")
  .action(async () => {
    const { workJobs } = await import("@/features/jobs/job-runner.service");

    await workJobs();
  });

program
  .command("enqueue")
  .description("Enqueue a job")
  .argument("<job-type>", "registered job type")
  .argument("[payload-json]", "optional JSON payload", jsonArgument)
  .action(async (type: string, payload: JsonValue | undefined) => {
    const { enqueueJob } = await import("@/features/jobs/enqueue-job");

    printJson(
      await enqueueJob({
        type,
        payload
      })
    );
  });

program
  .command("run")
  .description("Enqueue and immediately run one job")
  .argument("<job-type>", "registered job type")
  .argument("[payload-json]", "optional JSON payload", jsonArgument)
  .action(async (type: string, payload: JsonValue | undefined) => {
    const { toJobResponse } = await import("@/features/jobs/job.contract");
    const { assertKnownJobType, enqueueKnownJob, runnerId, runQueuedJob } =
      await import("@/features/jobs/job.service");

    assertKnownJobType(type);

    const enqueued = await enqueueKnownJob({
      type,
      payload
    });
    const completed = await runQueuedJob({
      uuid: enqueued.uuid,
      runnerId: runnerId()
    });

    printJson(toJobResponse(completed ?? enqueued));
  });

program
  .command("list")
  .description("List jobs")
  .action(async () => {
    const { listJobs } = await import("@/features/jobs/list-jobs");

    printJson(await listJobs());
  });

program
  .command("retry")
  .description("Retry a failed job")
  .argument("<job-id>", "job UUID")
  .action(async (jobId: string) => {
    const { retryJob } = await import("@/features/jobs/retry-job");

    printJson(await retryJob(jobId));
  });

try {
  await program.parseAsync(Bun.argv);
} catch (error) {
  if (error instanceof HttpError) {
    console.error(error.message);
    process.exit(1);
  }

  throw error;
}

function jsonArgument(text: string): JsonValue {
  try {
    return parseJsonValue(text);
  } catch {
    throw new InvalidArgumentError("expected a valid JSON value");
  }
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
