import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  roomProgramVersionAliasResponseSchema,
  upsertRoomProgramVersionAliasBodySchema,
  type RoomProgramVersionAliasResponse,
  type UpsertRoomProgramVersionAliasInput
} from "@/features/rooms/_shared/http/inputs";
import { roomProgramVersionAliases } from "@/features/rooms/db";
import {
  getProgramVersionByProgramAndVersion,
  getRoomProgramByUuid
} from "@/features/rooms/_shared/db/queries";
import { notFound } from "@/shared/http/errors";

export {
  roomProgramVersionAliasResponseSchema,
  upsertRoomProgramVersionAliasBodySchema
};

export async function upsertRoomProgramVersionAlias(
  programUuid: string,
  alias: string,
  input: UpsertRoomProgramVersionAliasInput
): Promise<RoomProgramVersionAliasResponse> {
  const program = await getRoomProgramByUuid(programUuid);
  const version = await getProgramVersionByProgramAndVersion({
    programId: program.id,
    version: input.version
  });

  if (!version) {
    throw notFound("Room program version not found");
  }

  const now = new Date().toISOString();
  const [existingAlias] = await db
    .select()
    .from(roomProgramVersionAliases)
    .where(
      and(
        eq(roomProgramVersionAliases.programId, program.id),
        eq(roomProgramVersionAliases.alias, alias)
      )
    );

  const [aliasRow] = existingAlias
    ? await db
        .update(roomProgramVersionAliases)
        .set({
          versionId: version.id,
          updatedAt: now
        })
        .where(eq(roomProgramVersionAliases.id, existingAlias.id))
        .returning()
    : await db
        .insert(roomProgramVersionAliases)
        .values({
          uuid: crypto.randomUUID(),
          programId: program.id,
          alias,
          versionId: version.id
        })
        .returning();

  return {
    id: aliasRow.uuid,
    programId: program.uuid,
    alias: aliasRow.alias,
    version: {
      id: version.uuid,
      version: version.version
    },
    createdAt: aliasRow.createdAt,
    updatedAt: aliasRow.updatedAt
  };
}
