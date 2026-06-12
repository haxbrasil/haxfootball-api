import type { RoomInstance } from "@/features/rooms/db";
import { badRequest } from "@/shared/http/errors";

export async function assertRoomCommunicationId(
  room: RoomInstance,
  commId: string
): Promise<void> {
  if ((await hashSecret(commId)) !== room.commIdHash) {
    throw badRequest("Invalid room communication ID");
  }
}

async function hashSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
