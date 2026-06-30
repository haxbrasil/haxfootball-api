import {
  roomProgramLanguageQuerySchema,
  roomProgramResponseSchema,
  toRoomProgramResponse,
  type RoomProgramResponse
} from "@/features/rooms/_shared/http/inputs";
import { getRoomProgramByUuid } from "@/features/rooms/_shared/db/queries";
import { resolveLabels } from "@/features/localization/resolve-labels";
import type { Static } from "elysia";

export { roomProgramLanguageQuerySchema, roomProgramResponseSchema };

export type RoomProgramLanguageQuery = Static<
  typeof roomProgramLanguageQuerySchema
>;

export async function getRoomProgram(
  uuid: string,
  query: RoomProgramLanguageQuery = {}
): Promise<RoomProgramResponse> {
  const program = await getRoomProgramByUuid(uuid);
  const labels = await resolveLabels(
    program.launchConfigFields.flatMap((field) =>
      field.description ? [field.label, field.description] : [field.label]
    ),
    query.language
  );

  return toRoomProgramResponse(program, labels);
}
