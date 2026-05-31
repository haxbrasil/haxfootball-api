import {
  type EventSchemaResponse,
  listEventSchemasResponseSchema,
  toEventSchemaResponse
} from "@/features/event-schemas/_shared/http/responses";
import { listEventSchemaRows } from "@/features/event-schemas/_shared/db/queries";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export { listEventSchemasResponseSchema };

export async function listEventSchemas(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<EventSchemaResponse>> {
  const rows = await listEventSchemaRows(query);
  const page = pageItems(rows, query, (row) => row.version.id);

  return {
    items: page.items.map(toEventSchemaResponse),
    page: page.page
  };
}
