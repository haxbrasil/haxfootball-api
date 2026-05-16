import {
  type JobScheduleResponse,
  jobScheduleResponseSchema,
  toJobScheduleResponse
} from "@/features/jobs/job.contract";
import { getJobScheduleByUuid } from "@/features/jobs/job.persistence";

export { jobScheduleResponseSchema };

export async function getJobSchedule(
  uuid: string
): Promise<JobScheduleResponse> {
  return toJobScheduleResponse(await getJobScheduleByUuid(uuid));
}
