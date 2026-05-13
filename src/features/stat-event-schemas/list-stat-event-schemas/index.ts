import {
  type StatEventSchemaResponse,
  listStatEventSchemasResponseSchema,
  toStatEventSchemaResponse
} from "@/features/stat-event-schemas/stat-event-schema.contract";
import { listStatEventSchemaRows } from "@/features/stat-event-schemas/stat-event-schema.persistence";
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
