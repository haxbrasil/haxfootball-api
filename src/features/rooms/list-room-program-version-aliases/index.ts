import {
  listRoomProgramVersionAliasesResponseSchema,
  toRoomProgramVersionAliasResponse,
  type RoomProgramVersionAliasResponse
} from "@/features/rooms/room.contract";
import {
  getRoomProgramByUuid,
  listProgramVersionAliases
} from "@/features/rooms/room.persistence";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export { listRoomProgramVersionAliasesResponseSchema };

export async function listRoomProgramVersionAliases(
  programUuid: string,
  query: PaginationQuery = {}
): Promise<PaginatedResponse<RoomProgramVersionAliasResponse>> {
  const program = await getRoomProgramByUuid(programUuid);
  const rows = await listProgramVersionAliases({
    programId: program.id,
    pagination: query
  });
  const page = pageItems(rows, query, (row) => String(row.alias.id));

  return {
    items: page.items.map((row) =>
      toRoomProgramVersionAliasResponse({
        alias: row.alias,
        program,
        version: row.version
      })
    ),
    page: page.page
  };
}
