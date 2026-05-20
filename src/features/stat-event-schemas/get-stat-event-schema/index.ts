import {
  type StatEventSchemaResponse,
  toStatEventSchemaResponse
} from "@/features/stat-event-schemas/_shared/http/responses";
import {
  getLatestStatEventSchemaRow,
  getLatestStatEventSchemaRowByName,
  getStatEventSchemaRow,
  getStatEventSchemaRowByName
} from "@/features/stat-event-schemas/_shared/db/queries";

export async function getLatestStatEventSchema(
  id: string
): Promise<StatEventSchemaResponse> {
  return toStatEventSchemaResponse(await getLatestStatEventSchemaRow(id));
}

export async function getLatestStatEventSchemaByName(
  name: string
): Promise<StatEventSchemaResponse> {
  return toStatEventSchemaResponse(
    await getLatestStatEventSchemaRowByName(name)
  );
}

export async function getStatEventSchemaVersion(
  id: string,
  version: number
): Promise<StatEventSchemaResponse> {
  return toStatEventSchemaResponse(await getStatEventSchemaRow(id, version));
}

export async function getStatEventSchemaVersionByName(
  name: string,
  version: number
): Promise<StatEventSchemaResponse> {
  return toStatEventSchemaResponse(
    await getStatEventSchemaRowByName(name, version)
  );
}
