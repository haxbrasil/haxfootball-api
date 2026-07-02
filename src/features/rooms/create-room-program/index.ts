import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  createRoomProgramBodySchema,
  toRoomProgramResponse,
  type CreateRoomProgramInput,
  type RoomProgramResponse
} from "@/features/rooms/_shared/http/inputs";
import { roomPrograms } from "@/features/rooms/db";
import { resolveLabels } from "@/features/localization/resolve-labels";
import { ensurePermissionsByKeys } from "@/features/permissions/ensure-permissions";
import {
  launchConfigRequiredPermissions,
  normalizeLaunchConfigFields
} from "@/features/rooms/_shared/domain/launch-config";
import { normalizeLiveStateContract } from "@/features/rooms/_shared/domain/live-state-contract";
import { badRequest } from "@/shared/http/errors";

export { createRoomProgramBodySchema };

export async function createRoomProgram(
  input: CreateRoomProgramInput
): Promise<RoomProgramResponse> {
  const [existingProgram] = await db
    .select({ id: roomPrograms.id })
    .from(roomPrograms)
    .where(eq(roomPrograms.name, input.name));

  if (existingProgram) {
    throw badRequest("Room program name already exists");
  }

  const launchConfigFields = normalizeLaunchConfigFields(
    input.launchConfigFields
  );
  const liveStateContract = normalizeLiveStateContract(input.liveStateContract);
  const program = await db.transaction(async (tx) => {
    await ensurePermissionsByKeys(
      tx,
      launchConfigRequiredPermissions(launchConfigFields)
    );

    const [program] = await tx
      .insert(roomPrograms)
      .values({
        uuid: crypto.randomUUID(),
        name: input.name,
        title: input.title ?? null,
        description: input.description ?? null,
        releaseSource: input.releaseSource,
        launchConfigFields,
        liveStateContract,
        integrationMode: input.integrationMode,
        haxballTokenEnvVar: input.haxballTokenEnvVar ?? "ROOM_TOKEN"
      })
      .returning();

    return program;
  });
  const labels = await resolveLabels(
    launchConfigFields.flatMap((field) =>
      field.description ? [field.label, field.description] : [field.label]
    )
  );

  return toRoomProgramResponse(program, labels);
}
