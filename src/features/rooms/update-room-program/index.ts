import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  toRoomProgramResponse,
  type RoomProgramResponse,
  updateRoomProgramBodySchema,
  type UpdateRoomProgramInput
} from "@/features/rooms/_shared/http/inputs";
import { roomPrograms } from "@/features/rooms/db";
import { getRoomProgramByUuid } from "@/features/rooms/_shared/db/queries";
import { normalizeLaunchConfigFields } from "@/features/rooms/_shared/domain/launch-config";

export { updateRoomProgramBodySchema };

export async function updateRoomProgram(
  uuid: string,
  input: UpdateRoomProgramInput
): Promise<RoomProgramResponse> {
  const program = await getRoomProgramByUuid(uuid);

  const [updatedProgram] = await db
    .update(roomPrograms)
    .set({
      title: input.title === undefined ? program.title : input.title,
      description:
        input.description === undefined
          ? program.description
          : input.description,
      releaseSource: input.releaseSource ?? program.releaseSource,
      launchConfigFields: input.launchConfigFields
        ? normalizeLaunchConfigFields(input.launchConfigFields)
        : program.launchConfigFields,
      integrationMode: input.integrationMode ?? program.integrationMode,
      haxballTokenEnvVar:
        input.haxballTokenEnvVar ?? program.haxballTokenEnvVar,
      updatedAt: new Date().toISOString()
    })
    .where(eq(roomPrograms.id, program.id))
    .returning();

  return toRoomProgramResponse(updatedProgram);
}
