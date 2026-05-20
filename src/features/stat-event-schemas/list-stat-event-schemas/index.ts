import {
  type StatEventSchemaResponse,
  listStatEventSchemasResponseSchema,
  toStatEventSchemaResponse
} from "@/features/stat-event-schemas/_shared/http/responses";
import { listStatEventSchemaRows } from "@/features/stat-event-schemas/_shared/db/queries";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export { listStatEventSchemasResponseSchema };

export async function listStatEventSchemas(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<StatEventSchemaResponse>> {
  const rows = await listStatEventSchemaRows(query);
  const page = pageItems(rows, query, (row) => row.version.id);

  return {
    items: page.items.map(toStatEventSchemaResponse),
    page: page.page
  };
}
