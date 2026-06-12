import type { RoomIncidentResponse } from "@/features/rooms/_shared/http/inputs";
import type { RoomInstanceIncident } from "@/features/rooms/db";
import { r2PublicUrl } from "@/shared/storage/r2";

export function toRoomIncidentResponse(
  incident: RoomInstanceIncident
): RoomIncidentResponse {
  return {
    id: incident.uuid,
    kind: incident.kind,
    url: r2PublicUrl(incident.objectKey),
    sizeBytes: incident.sizeBytes,
    sha256: incident.sha256,
    occurredAt: incident.occurredAt,
    createdAt: incident.createdAt
  };
}
