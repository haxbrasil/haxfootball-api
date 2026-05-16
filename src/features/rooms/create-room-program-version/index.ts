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
    if (
      input.artifact.checksumSha256 &&
      existingVersion.artifact.checksumSha256 ===
        input.artifact.checksumSha256 &&
      existingVersion.artifact.releaseId === input.artifact.releaseId &&
      existingVersion.artifact.tagName === input.artifact.tagName &&
      existingVersion.artifact.assetUrl === input.artifact.assetUrl &&
      existingVersion.artifact.assetName === input.artifact.assetName &&
      existingVersion.artifact.publishedAt === input.artifact.publishedAt &&
      existingVersion.entrypoint === input.entrypoint &&
      existingVersion.installStrategy === (input.installStrategy ?? "npm-ci")
    ) {
      return toRoomProgramVersionResponse(existingVersion, program);
    }

    throw badRequest("Room program version already exists");
  }

  const [version] = await db
    .insert(roomProgramVersions)
    .values({
      uuid: crypto.randomUUID(),
      programId: program.id,
      version: input.version,
      artifact: input.artifact,
      entrypoint: input.entrypoint,
      installStrategy: input.installStrategy ?? "npm-ci"
    })
    .returning();

  return toRoomProgramVersionResponse(version, program);
}
