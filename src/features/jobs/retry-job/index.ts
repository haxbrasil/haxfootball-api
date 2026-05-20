import {
  type JobResponse,
  jobResponseSchema,
  toJobResponse
} from "@/features/jobs/_shared/http/responses";
import { retryFailedJob } from "@/features/jobs/_shared/db/queries";

export { jobResponseSchema };

export async function retryJob(uuid: string): Promise<JobResponse> {
  return toJobResponse(await retryFailedJob(uuid));
}
