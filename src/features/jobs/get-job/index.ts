import {
  type JobResponse,
  jobResponseSchema,
  toJobResponse
} from "@/features/jobs/job.contract";
import { getJobByUuid } from "@/features/jobs/job.persistence";

export { jobResponseSchema };

export async function getJob(uuid: string): Promise<JobResponse> {
  return toJobResponse(await getJobByUuid(uuid));
}
