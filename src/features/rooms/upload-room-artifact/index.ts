import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/config/env";
import {
  roomArtifactResponseSchema,
  uploadRoomArtifactBodySchema,
  type RoomArtifactResponse,
  type UploadRoomArtifactInput
} from "@/features/rooms/room.contract";
import { getRoomProgramByUuid } from "@/features/rooms/room.persistence";

export { roomArtifactResponseSchema, uploadRoomArtifactBodySchema };

export async function uploadRoomArtifact(
  programUuid: string,
  input: UploadRoomArtifactInput
): Promise<RoomArtifactResponse> {
  await getRoomProgramByUuid(programUuid);

  const storageKey = `rooms/${input.branch}/${input.sha}/${input.assetName}`;
  const artifactPath = join(env.roomArtifactStorageDir, storageKey);
  const arrayBuffer = await input.file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  await mkdir(
    join(env.roomArtifactStorageDir, "rooms", input.branch, input.sha),
    {
      recursive: true
    }
  );
  await writeFile(artifactPath, bytes);

  const checksumSha256 = await sha256Hex(arrayBuffer);
  const publicBaseUrl = env.publicBaseUrl.replace(/\/+$/u, "");

  return {
    assetName: input.assetName,
    assetUrl: `${publicBaseUrl}/artifacts/${storageKey}`,
    checksumSha256,
    storageKey
  };
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
