import { db } from "@/db/client";
import {
  createRoomProgramVersionBodySchema,
  toRoomProgramVersionResponse,
  type CreateRoomProgramVersionInput,
  type RoomProgramVersionResponse
} from "@/features/rooms/room.contract";
import { roomProgramVersions } from "@/features/rooms/room.db";
import {
  getProgramVersionByProgramAndVersion,
  getRoomProgramByUuid
} from "@/features/rooms/room.persistence";
import { badRequest } from "@/shared/http/errors";

export { createRoomProgramVersionBodySchema };

export async function createRoomProgramVersion(
  programUuid: string,
  input: CreateRoomProgramVersionInput
): Promise<RoomProgramVersionResponse> {
  const program = await getRoomProgramByUuid(programUuid);
  const existingVersion = await getProgramVersionByProgramAndVersion({
    programId: program.id,
    version: input.version
  });

  if (existingVersion) {
    throw badRequest("Room program version already exists");
  }

  const [version] = await db
    .insert(roomProgramVersions)
    .values({
      uuid: crypto.randomUUID(),
      programId: program.id,
      version: input.version,
      artifact: input.artifact,
      nodeEntrypoint: input.nodeEntrypoint,
      installStrategy: input.installStrategy ?? "npm-ci"
    })
    .returning();

  return toRoomProgramVersionResponse(version, program);
}
