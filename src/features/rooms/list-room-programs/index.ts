import { db } from "@/db/client";
import {
  listRoomProgramsQuerySchema,
  listRoomProgramsResponseSchema,
  toRoomProgramResponse,
  type RoomProgramResponse
} from "@/features/rooms/_shared/http/inputs";
import { roomPrograms } from "@/features/rooms/db";
import { resolveLabels } from "@/features/localization/resolve-labels";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  type PaginatedResponse
} from "@lib";
import type { Static } from "elysia";

export { listRoomProgramsQuerySchema, listRoomProgramsResponseSchema };

export type ListRoomProgramsQuery = Static<typeof listRoomProgramsQuerySchema>;

export async function listRoomPrograms(
  query: ListRoomProgramsQuery = {}
): Promise<PaginatedResponse<RoomProgramResponse>> {
  const programs = await db
    .select()
    .from(roomPrograms)
    .where(cursorAfter(roomPrograms.name, query.cursor, "asc"))
    .orderBy(cursorSort(roomPrograms.name, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(programs, query, (program) => program.name);
  const labels = await resolveLabels(
    launchFieldLabelKeys(page.items),
    query.language
  );

  return {
    items: page.items.map((program) => toRoomProgramResponse(program, labels)),
    page: page.page
  };
}

function launchFieldLabelKeys(programs: (typeof roomPrograms.$inferSelect)[]) {
  return programs.flatMap((program) =>
    program.launchConfigFields.flatMap((field) =>
      field.description ? [field.label, field.description] : [field.label]
    )
  );
}
