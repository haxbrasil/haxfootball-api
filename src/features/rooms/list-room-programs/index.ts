import { db } from "@/db/client";
import {
  listRoomProgramsResponseSchema,
  toRoomProgramResponse,
  type RoomProgramResponse
} from "@/features/rooms/room.contract";
import { roomPrograms } from "@/features/rooms/room.db";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export { listRoomProgramsResponseSchema };

export async function listRoomPrograms(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<RoomProgramResponse>> {
  const programs = await db
    .select()
    .from(roomPrograms)
    .where(cursorAfter(roomPrograms.name, query.cursor, "asc"))
    .orderBy(cursorSort(roomPrograms.name, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(programs, query, (program) => program.name);

  return {
    items: page.items.map(toRoomProgramResponse),
    page: page.page
  };
}
