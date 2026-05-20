import {
  assertKnownJobType,
  enqueueKnownJob,
  runnerId,
  runQueuedJob
} from "@/features/jobs/_shared/domain/execution";
import {
  type JobResponse,
  toJobResponse
} from "@/features/jobs/_shared/http/responses";
import type { JsonValue } from "@lib/json";

export async function runJob(input: {
  type: string;
  payload?: JsonValue;
}): Promise<JobResponse> {
  assertKnownJobType(input.type);

  const enqueued = await enqueueKnownJob(input);
  const completed = await runQueuedJob({
    uuid: enqueued.uuid,
    runnerId: runnerId()
  });

  return toJobResponse(completed ?? enqueued);
}
