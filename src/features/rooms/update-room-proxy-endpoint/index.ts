import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  toRoomProxyEndpointResponse,
  type RoomProxyEndpointResponse,
  updateRoomProxyEndpointBodySchema,
  type UpdateRoomProxyEndpointInput
} from "@/features/rooms/_shared/http/inputs";
import { roomProxyEndpoints } from "@/features/rooms/db";
import { getRoomProxyEndpointByUuid } from "@/features/rooms/_shared/db/queries";

export { updateRoomProxyEndpointBodySchema };

export async function updateRoomProxyEndpoint(
  uuid: string,
  input: UpdateRoomProxyEndpointInput
): Promise<RoomProxyEndpointResponse> {
  const endpoint = await getRoomProxyEndpointByUuid(uuid);
  const [updatedEndpoint] = await db
    .update(roomProxyEndpoints)
    .set({
      displayName: input.displayName ?? endpoint.displayName,
      outboundIp: input.outboundIp ?? endpoint.outboundIp,
      proxyUrl: input.proxyUrl ?? endpoint.proxyUrl,
      enabled: input.enabled ?? endpoint.enabled,
      updatedAt: new Date().toISOString()
    })
    .where(eq(roomProxyEndpoints.id, endpoint.id))
    .returning();

  return toRoomProxyEndpointResponse(updatedEndpoint);
}
