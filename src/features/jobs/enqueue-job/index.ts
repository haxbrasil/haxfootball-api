import {
  type JobResponse,
  jobResponseSchema,
  toJobResponse
} from "@/features/jobs/job.contract";
import { enqueueKnownJob } from "@/features/jobs/job.service";
import type { JsonValue } from "@lib/json";

export { jobResponseSchema };

export async function enqueueJob(input: {
  type: string;
  payload?: JsonValue;
  maxAttempts?: number;
}): Promise<JobResponse> {
  return toJobResponse(await enqueueKnownJob(input));
}
