import {
  type JobResponse,
  jobResponseSchema,
  toJobResponse
} from "@/features/jobs/_shared/http/responses";
import { getJobByUuid } from "@/features/jobs/_shared/db/queries";

export { jobResponseSchema };

export async function getJob(uuid: string): Promise<JobResponse> {
  return toJobResponse(await getJobByUuid(uuid));
}
