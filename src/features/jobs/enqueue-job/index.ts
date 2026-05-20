import {
  type JobResponse,
  jobResponseSchema,
  toJobResponse
} from "@/features/jobs/_shared/http/responses";
import { enqueueKnownJob } from "@/features/jobs/_shared/domain/execution";
import type { JsonValue } from "@lib/json";

export { jobResponseSchema };

export async function enqueueJob(input: {
  type: string;
  payload?: JsonValue;
  maxAttempts?: number;
}): Promise<JobResponse> {
  return toJobResponse(await enqueueKnownJob(input));
}
