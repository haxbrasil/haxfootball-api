import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  listRoomProxyEndpointsResponseSchema,
  toRoomProxyEndpointResponse,
  type RoomProxyEndpointResponse
} from "@/features/rooms/room.contract";
import { roomProxyEndpoints } from "@/features/rooms/room.db";

export { listRoomProxyEndpointsResponseSchema };

export async function listRoomProxyEndpoints(): Promise<
  RoomProxyEndpointResponse[]
> {
  const endpoints = await db
    .select()
    .from(roomProxyEndpoints)
    .orderBy(asc(roomProxyEndpoints.key));

  return endpoints.map(toRoomProxyEndpointResponse);
}
