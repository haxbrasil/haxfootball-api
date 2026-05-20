import {
  type JobResponse,
  listJobsResponseSchema,
  toJobResponse
} from "@/features/jobs/_shared/http/responses";
import { listJobRows } from "@/features/jobs/_shared/db/queries";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export { listJobsResponseSchema };

export async function listJobs(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<JobResponse>> {
  const rows = await listJobRows(query);
  const page = pageItems(rows, query, (row) => row.id);

  return {
    items: page.items.map(toJobResponse),
    page: page.page
  };
}
