import { existsSync } from "node:fs";
import { join } from "node:path";
import { env } from "@/config/env";
import { roomArtifactParamsSchema } from "@/features/rooms/room.contract";
import { notFound } from "@/shared/http/errors";

export { roomArtifactParamsSchema };

export type ServeRoomArtifactInput = {
  branch: string;
  sha: string;
  assetName: string;
};

export function serveRoomArtifact(input: ServeRoomArtifactInput): Response {
  const artifactPath = join(
    env.roomArtifactStorageDir,
    "rooms",
    input.branch,
    input.sha,
    input.assetName
  );

  if (!existsSync(artifactPath)) {
    throw notFound("Room artifact not found");
  }

  return new Response(Bun.file(artifactPath), {
    headers: {
      "content-type": "application/gzip"
    }
  });
}
