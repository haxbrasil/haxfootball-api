import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  reportRoomReadyBodySchema,
  roomResponseSchema,
  toRoomResponse,
  type ReportRoomReadyInput,
  type RoomResponse
} from "@/features/rooms/_shared/http/inputs";
import { roomInstances } from "@/features/rooms/db";
import { getRoomRow } from "@/features/rooms/_shared/db/queries";
import { assertRoomCommunicationId } from "@/features/rooms/_shared/domain/room-communication";
import { badRequest } from "@/shared/http/errors";

export {
  reportRoomReadyBodySchema,
  roomResponseSchema as reportRoomReadyResponseSchema
};

export async function reportRoomReady(
  uuid: string,
  input: ReportRoomReadyInput
): Promise<RoomResponse> {
  const row = await getRoomRow(uuid);

  if (row.program.integrationMode !== "integrated") {
    throw badRequest("Room program is not integrated");
  }

  if (row.room.state === "closed" || row.room.state === "failed") {
    throw badRequest("Terminal room cannot be marked ready");
  }

  await assertRoomCommunicationId(row.room, input.commId);

  const [updatedRoom] = await db
    .update(roomInstances)
    .set({
      state: "running",
      roomLink: input.roomLink,
      failedAt: null,
      failureReason: null,
      updatedAt: new Date().toISOString()
    })
    .where(eq(roomInstances.id, row.room.id))
    .returning();

  return toRoomResponse({
    ...row,
    room: updatedRoom
  });
}
