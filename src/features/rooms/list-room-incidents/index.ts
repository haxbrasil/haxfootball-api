import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  listRoomIncidentsResponseSchema as baseListRoomIncidentsResponseSchema,
  type RoomIncidentResponse
} from "@/features/rooms/_shared/http/inputs";
import { toRoomIncidentResponse } from "@/features/rooms/_shared/http/incident-responses";
import { getRoomRow } from "@/features/rooms/_shared/db/queries";
import { roomInstanceIncidents } from "@/features/rooms/db";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export const listRoomIncidentsResponseSchema =
  baseListRoomIncidentsResponseSchema;

export async function listRoomIncidents(
  roomUuid: string,
  query: PaginationQuery = {}
): Promise<PaginatedResponse<RoomIncidentResponse>> {
  const row = await getRoomRow(roomUuid);
  const rows = await db
    .select()
    .from(roomInstanceIncidents)
    .where(
      and(
        eq(roomInstanceIncidents.roomInstanceId, row.room.id),
        cursorAfter(roomInstanceIncidents.id, query.cursor, "desc")
      )
    )
    .orderBy(cursorSort(roomInstanceIncidents.id, "desc"))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, (incident) => incident.id);

  return {
    items: page.items.map(toRoomIncidentResponse),
    page: page.page
  };
}
