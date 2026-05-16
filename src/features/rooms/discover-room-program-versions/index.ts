import { db } from "@/db/client";
import {
  discoverRoomProgramVersionsBodySchema,
  roomProgramVersionResponseSchema,
  toRoomProgramVersionResponse,
  type DiscoverRoomProgramVersionsInput,
  type RoomProgramVersionResponse
} from "@/features/rooms/room.contract";
import { roomProgramVersions } from "@/features/rooms/room.db";
import { listGithubReleases } from "@/features/rooms/github-release.service";
import {
  getProgramVersionByProgramAndVersion,
  getRoomProgramByUuid
} from "@/features/rooms/room.persistence";
import { matchReleaseAsset } from "@/features/rooms/room.service";
import { t } from "elysia";

export { discoverRoomProgramVersionsBodySchema };

export const discoverRoomProgramVersionsResponseSchema = t.Array(
  roomProgramVersionResponseSchema
);

export async function discoverRoomProgramVersions(
  programUuid: string,
  input: DiscoverRoomProgramVersionsInput
): Promise<RoomProgramVersionResponse[]> {
  const program = await getRoomProgramByUuid(programUuid);
  const releases = await listGithubReleases(program.releaseSource);
  const createdVersions = [];

  for (const release of releases.filter((candidate) => !candidate.draft)) {
    const existingVersion = await getProgramVersionByProgramAndVersion({
      programId: program.id,
      version: release.tagName
    });

    if (existingVersion) {
      continue;
    }

    const asset = matchReleaseAsset(
      release,
      program.releaseSource.assetPattern
    );

    if (!asset) {
      continue;
    }

    const [version] = await db
      .insert(roomProgramVersions)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        version: release.tagName,
        artifact: {
          releaseId: release.id,
          tagName: release.tagName,
          assetName: asset.name,
          assetUrl: asset.downloadUrl,
          publishedAt: release.publishedAt
        },
        entrypoint: input.entrypoint,
        installStrategy: input.installStrategy ?? "npm-ci"
      })
      .returning();

    createdVersions.push(version);
  }

  return createdVersions.map((version) =>
    toRoomProgramVersionResponse(version, program)
  );
}
