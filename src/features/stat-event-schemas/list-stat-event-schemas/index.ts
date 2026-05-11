import {
  type StatEventSchemaResponse,
  listStatEventSchemasResponseSchema,
  toStatEventSchemaResponse
} from "@/features/stat-event-schemas/stat-event-schema.contract";
import { listStatEventSchemaRows } from "@/features/stat-event-schemas/stat-event-schema.persistence";

export { listStatEventSchemasResponseSchema };

export async function listStatEventSchemas(): Promise<
  StatEventSchemaResponse[]
> {
  const rows = await listStatEventSchemaRows();

  return rows.map(toStatEventSchemaResponse);
}
