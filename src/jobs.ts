import { Command, InvalidArgumentError } from "commander";
import type { JsonValue } from "@lib/json";
import { parseJsonValue } from "@lib/json";
import { enqueueJob } from "@/features/jobs/enqueue-job";
import { listJobs } from "@/features/jobs/list-jobs";
import { retryJob } from "@/features/jobs/retry-job";
import { runJob } from "@/features/jobs/run-job";
import { workJobs } from "@/features/jobs/work-jobs";
import { workMediaJobs } from "@/features/media-renditions/work-media-jobs";
import { HttpError } from "@/shared/http/errors";

const program = new Command()
  .name("jobs")
  .description("Operate HaxFootball API background jobs")
  .showHelpAfterError();

program
  .command("work")
  .description("Run the long-lived job runner")
  .action(async () => {
    await workJobs();
  });

program
  .command("media-work")
  .description("Run the media rendition worker")
  .action(async () => {
    await workMediaJobs();
  });

program
  .command("enqueue")
  .description("Enqueue a job")
  .argument("<job-type>", "registered job type")
  .argument("[payload-json]", "optional JSON payload", jsonArgument)
  .action(async (type: string, payload: JsonValue | undefined) => {
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
    printJson(await runJob({ type, payload }));
  });

program
  .command("list")
  .description("List jobs")
  .action(async () => {
    printJson(await listJobs());
  });

program
  .command("retry")
  .description("Retry a failed job")
  .argument("<job-id>", "job UUID")
  .action(async (jobId: string) => {
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
