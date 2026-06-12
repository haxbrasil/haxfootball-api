import { gzipSync } from "node:zlib";
import { env } from "@/config/env";
import { db } from "@/db/client";
import {
  roomIncidentInputSchema,
  roomIncidentResponseSchema,
  type RoomIncidentInput,
  type RoomIncidentResponse
} from "@/features/rooms/_shared/http/inputs";
import { toRoomIncidentResponse } from "@/features/rooms/_shared/http/incident-responses";
import { getRoomRow } from "@/features/rooms/_shared/db/queries";
import { assertRoomCommunicationId } from "@/features/rooms/_shared/domain/room-communication";
import { roomInstanceIncidents } from "@/features/rooms/db";
import { sha256Hex } from "@/shared/crypto/sha256";
import { badRequest } from "@/shared/http/errors";
import { putR2Object } from "@/shared/storage/r2";

export const addRoomIncidentBodySchema = roomIncidentInputSchema;
export const addRoomIncidentResponseSchema = roomIncidentResponseSchema;

export async function addRoomIncident(
  roomUuid: string,
  input: RoomIncidentInput
): Promise<RoomIncidentResponse> {
  const row = await getRoomRow(roomUuid);

  await assertRoomCommunicationId(row.room, input.commId);

  const incidentId = crypto.randomUUID();
  const bundle = {
    kind: input.kind,
    occurredAt: input.occurredAt,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.playerId !== undefined ? { playerId: input.playerId } : {}),
    ...(input.tick !== undefined ? { tick: input.tick } : {}),
    records: input.records,
    ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {})
  };
  const uncompressedBytes = new TextEncoder().encode(JSON.stringify(bundle));

  if (uncompressedBytes.byteLength > env.roomIncidentMaxBytes) {
    throw badRequest("Room incident payload is too large");
  }

  const compressedBytes = gzipSync(uncompressedBytes);
  const objectKey = `incidents/rooms/${roomUuid}/${incidentId}.json.gz`;
  const sha256 = await sha256Hex(compressedBytes);

  await putR2Object({
    key: objectKey,
    body: compressedBytes,
    contentType: "application/json",
    contentEncoding: "gzip"
  });

  const [incident] = await db
    .insert(roomInstanceIncidents)
    .values({
      uuid: incidentId,
      roomInstanceId: row.room.id,
      kind: input.kind,
      objectKey,
      sizeBytes: compressedBytes.byteLength,
      sha256,
      playerId: input.playerId ?? null,
      tick: input.tick ?? null,
      reason: input.reason ?? null,
      occurredAt: input.occurredAt
    })
    .returning();

  return toRoomIncidentResponse(incident);
}
