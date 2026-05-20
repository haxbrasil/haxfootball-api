import {
  type JobScheduleResponse,
  listJobSchedulesResponseSchema,
  toJobScheduleResponse
} from "@/features/jobs/_shared/http/responses";
import { listJobScheduleRows } from "@/features/jobs/_shared/db/queries";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export { listJobSchedulesResponseSchema };

export async function listJobSchedules(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<JobScheduleResponse>> {
  const rows = await listJobScheduleRows(query);
  const page = pageItems(rows, query, (row) => row.id);

  return {
    items: page.items.map(toJobScheduleResponse),
    page: page.page
  };
}
