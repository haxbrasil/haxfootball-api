import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  listRoomProgramVersionsResponseSchema,
  toRoomProgramVersionResponse,
  type RoomProgramVersionResponse
} from "@/features/rooms/room.contract";
import { roomProgramVersions } from "@/features/rooms/room.db";
import { getRoomProgramByUuid } from "@/features/rooms/room.persistence";

export { listRoomProgramVersionsResponseSchema };

export async function listRoomProgramVersions(
  programUuid: string
): Promise<RoomProgramVersionResponse[]> {
  const program = await getRoomProgramByUuid(programUuid);
  const versions = await db
    .select()
    .from(roomProgramVersions)
    .where(eq(roomProgramVersions.programId, program.id))
    .orderBy(asc(roomProgramVersions.version));

  return versions.map((version) =>
    toRoomProgramVersionResponse(version, program)
  );
}
