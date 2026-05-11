import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  reportRoomReadyBodySchema,
  roomResponseSchema,
  toRoomResponse,
  type ReportRoomReadyInput,
  type RoomResponse
} from "@/features/rooms/room.contract";
import { roomInstances } from "@/features/rooms/room.db";
import { getRoomRow } from "@/features/rooms/room.persistence";
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

  if (!row.program.supportsManualLinking) {
    throw badRequest("Room program does not support manual linking");
  }

  if (row.room.state === "closed") {
    throw badRequest("Closed room cannot be marked ready");
  }

  if ((await hashSecret(input.commId)) !== row.room.commIdHash) {
    throw badRequest("Invalid room communication ID");
  }

  const [updatedRoom] = await db
    .update(roomInstances)
    .set({
      state: "running",
      roomLink: input.roomLink,
      updatedAt: new Date().toISOString()
    })
    .where(eq(roomInstances.id, row.room.id))
    .returning();

  return toRoomResponse({
    ...row,
    room: updatedRoom
  });
}

async function hashSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
