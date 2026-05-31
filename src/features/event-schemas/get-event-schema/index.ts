import {
  type EventSchemaResponse,
  toEventSchemaResponse
} from "@/features/event-schemas/_shared/http/responses";
import {
  getLatestEventSchemaRow,
  getLatestEventSchemaRowByName,
  getEventSchemaRow,
  getEventSchemaRowByName
} from "@/features/event-schemas/_shared/db/queries";

export async function getLatestEventSchema(
  id: string
): Promise<EventSchemaResponse> {
  return toEventSchemaResponse(await getLatestEventSchemaRow(id));
}

export async function getLatestEventSchemaByName(
  name: string
): Promise<EventSchemaResponse> {
  return toEventSchemaResponse(await getLatestEventSchemaRowByName(name));
}

export async function getEventSchemaVersion(
  id: string,
  version: number
): Promise<EventSchemaResponse> {
  return toEventSchemaResponse(await getEventSchemaRow(id, version));
}

export async function getEventSchemaVersionByName(
  name: string,
  version: number
): Promise<EventSchemaResponse> {
  return toEventSchemaResponse(await getEventSchemaRowByName(name, version));
}
