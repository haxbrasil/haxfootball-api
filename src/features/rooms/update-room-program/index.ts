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
import { resolveLabels } from "@/features/localization/resolve-labels";
import { ensurePermissionsByKeys } from "@/features/permissions/ensure-permissions";
import {
  launchConfigRequiredPermissions,
  normalizeLaunchConfigFields
} from "@/features/rooms/_shared/domain/launch-config";

export { updateRoomProgramBodySchema };

export async function updateRoomProgram(
  uuid: string,
  input: UpdateRoomProgramInput
): Promise<RoomProgramResponse> {
  const program = await getRoomProgramByUuid(uuid);
  const launchConfigFields = input.launchConfigFields
    ? normalizeLaunchConfigFields(input.launchConfigFields)
    : program.launchConfigFields;

  const updatedProgram = await db.transaction(async (tx) => {
    await ensurePermissionsByKeys(
      tx,
      launchConfigRequiredPermissions(launchConfigFields)
    );

    const [updatedProgram] = await tx
      .update(roomPrograms)
      .set({
        title: input.title === undefined ? program.title : input.title,
        description:
          input.description === undefined
            ? program.description
            : input.description,
        releaseSource: input.releaseSource ?? program.releaseSource,
        launchConfigFields,
        integrationMode: input.integrationMode ?? program.integrationMode,
        haxballTokenEnvVar:
          input.haxballTokenEnvVar ?? program.haxballTokenEnvVar,
        updatedAt: new Date().toISOString()
      })
      .where(eq(roomPrograms.id, program.id))
      .returning();

    return updatedProgram;
  });
  const labels = await resolveLabels(
    launchConfigFields.flatMap((field) =>
      field.description ? [field.label, field.description] : [field.label]
    )
  );

  return toRoomProgramResponse(updatedProgram, labels);
}
