import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  createRoomProgramBodySchema,
  toRoomProgramResponse,
  type CreateRoomProgramInput,
  type RoomProgramResponse
} from "@/features/rooms/_shared/http/inputs";
import { roomPrograms } from "@/features/rooms/db";
import { normalizeLaunchConfigFields } from "@/features/rooms/_shared/domain/launch-config";
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

  const [program] = await db
    .insert(roomPrograms)
    .values({
      uuid: crypto.randomUUID(),
      name: input.name,
      title: input.title ?? null,
      description: input.description ?? null,
      releaseSource: input.releaseSource,
      launchConfigFields: normalizeLaunchConfigFields(input.launchConfigFields),
      integrationMode: input.integrationMode,
      haxballTokenEnvVar: input.haxballTokenEnvVar ?? "ROOM_TOKEN"
    })
    .returning();

  return toRoomProgramResponse(program);
}
