import {
  type StatEventSchemaResponse,
  toStatEventSchemaResponse
} from "@/features/stat-event-schemas/stat-event-schema.contract";
import {
  getLatestStatEventSchemaRow,
  getStatEventSchemaRow
} from "@/features/stat-event-schemas/stat-event-schema.persistence";

export async function getLatestStatEventSchema(
  id: string
): Promise<StatEventSchemaResponse> {
  return toStatEventSchemaResponse(await getLatestStatEventSchemaRow(id));
}

export async function getStatEventSchemaVersion(
  id: string,
  version: number
): Promise<StatEventSchemaResponse> {
  return toStatEventSchemaResponse(await getStatEventSchemaRow(id, version));
}
