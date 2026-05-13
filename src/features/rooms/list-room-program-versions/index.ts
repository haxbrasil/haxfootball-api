import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  listRoomProgramVersionsResponseSchema,
  toRoomProgramVersionResponse,
  type RoomProgramVersionResponse
} from "@/features/rooms/room.contract";
import { roomProgramVersions } from "@/features/rooms/room.db";
import { getRoomProgramByUuid } from "@/features/rooms/room.persistence";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export { listRoomProgramVersionsResponseSchema };

export async function listRoomProgramVersions(
  programUuid: string,
  query: PaginationQuery = {}
): Promise<PaginatedResponse<RoomProgramVersionResponse>> {
  const program = await getRoomProgramByUuid(programUuid);
  const versions = await db
    .select()
    .from(roomProgramVersions)
    .where(
      and(
        eq(roomProgramVersions.programId, program.id),
        cursorAfter(roomProgramVersions.version, query.cursor, "asc")
      )
    )
    .orderBy(cursorSort(roomProgramVersions.version, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(versions, query, (version) => version.version);

  return {
    items: page.items.map((version) =>
      toRoomProgramVersionResponse(version, program)
    ),
    page: page.page
  };
}
