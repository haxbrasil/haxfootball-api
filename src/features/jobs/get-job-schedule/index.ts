import {
  type JobScheduleResponse,
  jobScheduleResponseSchema,
  toJobScheduleResponse
} from "@/features/jobs/_shared/http/responses";
import { getJobScheduleByUuid } from "@/features/jobs/_shared/db/queries";

export { jobScheduleResponseSchema };

export async function getJobSchedule(
  uuid: string
): Promise<JobScheduleResponse> {
  return toJobScheduleResponse(await getJobScheduleByUuid(uuid));
}
