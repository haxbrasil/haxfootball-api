import { db } from "@/db/client";
import {
  listRoomProxyEndpointsResponseSchema,
  toRoomProxyEndpointResponse,
  type RoomProxyEndpointResponse
} from "@/features/rooms/room.contract";
import { roomProxyEndpoints } from "@/features/rooms/room.db";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export { listRoomProxyEndpointsResponseSchema };

export async function listRoomProxyEndpoints(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<RoomProxyEndpointResponse>> {
  const endpoints = await db
    .select()
    .from(roomProxyEndpoints)
    .where(cursorAfter(roomProxyEndpoints.key, query.cursor, "asc"))
    .orderBy(cursorSort(roomProxyEndpoints.key, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(endpoints, query, (endpoint) => endpoint.key);

  return {
    items: page.items.map(toRoomProxyEndpointResponse),
    page: page.page
  };
}
