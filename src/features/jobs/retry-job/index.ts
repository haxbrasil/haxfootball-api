import {
  type JobResponse,
  jobResponseSchema,
  toJobResponse
} from "@/features/jobs/job.contract";
import { retryFailedJob } from "@/features/jobs/job.persistence";

export { jobResponseSchema };

export async function retryJob(uuid: string): Promise<JobResponse> {
  return toJobResponse(await retryFailedJob(uuid));
}
