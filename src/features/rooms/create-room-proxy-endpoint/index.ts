import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  createRoomProxyEndpointBodySchema,
  toRoomProxyEndpointResponse,
  type CreateRoomProxyEndpointInput,
  type RoomProxyEndpointResponse
} from "@/features/rooms/room.contract";
import { roomProxyEndpoints } from "@/features/rooms/room.db";
import { badRequest } from "@/shared/http/errors";

export { createRoomProxyEndpointBodySchema };

export async function createRoomProxyEndpoint(
  input: CreateRoomProxyEndpointInput
): Promise<RoomProxyEndpointResponse> {
  const [existingEndpoint] = await db
    .select({ id: roomProxyEndpoints.id })
    .from(roomProxyEndpoints)
    .where(eq(roomProxyEndpoints.key, input.key));

  if (existingEndpoint) {
    throw badRequest("Room proxy endpoint key already exists");
  }

  const [endpoint] = await db
    .insert(roomProxyEndpoints)
    .values({
      uuid: crypto.randomUUID(),
      key: input.key,
      displayName: input.displayName,
      outboundIp: input.outboundIp,
      proxyUrl: input.proxyUrl,
      enabled: input.enabled ?? true
    })
    .returning();

  return toRoomProxyEndpointResponse(endpoint);
}
