import { eq } from "drizzle-orm";
import { env } from "@/config/env";
import { db } from "@/db/client";
import {
  createRoomBodySchema,
  toRoomResponse,
  type CreateRoomInput,
  type RoomResponse
} from "@/features/rooms/room.contract";
import {
  roomInstances,
  roomPrograms,
  roomProgramVersions
} from "@/features/rooms/room.db";
import { listGithubReleases } from "@/features/rooms/github-release.service";
import {
  getLatestProgramVersion,
  getProgramVersionAliasByProgramAndAlias,
  getProgramVersionByProgramAndVersion,
  getRoomProgramByUuid,
  listEnabledProxyEndpoints,
  listOpenRoomInstances
} from "@/features/rooms/room.persistence";
import {
  buildEffectiveRoomEnvironment,
  chooseProxyEndpoint,
  latestStableRelease,
  matchReleaseAsset,
  resolveLaunchConfig
} from "@/features/rooms/room.service";
import { launchRoomProcess } from "@/features/rooms/room-process.service";
import { badRequest, notFound } from "@/shared/http/errors";

export { createRoomBodySchema };

export type SignRoomJwt = () => Promise<string>;

export async function createRoom(
  input: CreateRoomInput,
  signRoomJwt: SignRoomJwt
): Promise<RoomResponse> {
  const program = await getRoomProgramByUuid(input.programId);
  const version = await resolveProgramVersion(input.version, program.id);
  const firstConfigResolution = resolveLaunchConfig({
    fields: program.launchConfigFields,
    values: input.launchConfig ?? {},
    assignedProxy: null,
    publicPolicy: env.roomPublicPolicy
  });
  const requestedProxy = stringLaunchConfigValue(input.launchConfig?.proxy);
  const proxyEndpoint = chooseProxyEndpoint({
    endpoints: await listEnabledProxyEndpoints(),
    openRooms: await listOpenRoomInstances(),
    requestedProxy,
    publicRoom: firstConfigResolution.publicRoom
  });
  const configResolution = resolveLaunchConfig({
    fields: program.launchConfigFields,
    values: input.launchConfig ?? {},
    assignedProxy: proxyEndpoint,
    publicPolicy: env.roomPublicPolicy
  });
  const commId = crypto.randomUUID() + crypto.randomUUID();
  const roomUuid = crypto.randomUUID();
  const roomApiJwt = await signRoomJwt();
  const environment = buildEffectiveRoomEnvironment({
    program,
    fields: program.launchConfigFields,
    environmentValues: configResolution.environmentValues,
    haxballToken: input.haxballToken,
    roomId: roomUuid,
    roomApiUrl: roomApiUrl(),
    roomApiJwt,
    commId
  });
  const [room] = await db
    .insert(roomInstances)
    .values({
      uuid: roomUuid,
      programId: program.id,
      versionId: version.id,
      proxyEndpointId: proxyEndpoint?.id ?? null,
      state: "provisioning",
      roomLink: null,
      launchConfig: configResolution.sanitizedLaunchConfig,
      public: configResolution.publicRoom,
      commIdHash: await hashSecret(commId)
    })
    .returning();

  const launch = await launchRoomProcess({
    roomId: room.uuid,
    version,
    environment
  });
  const nextRoomLink =
    program.integrationMode === "external" ? (launch.roomLink ?? null) : null;
  const nextState = nextRoomLink ? "running" : "provisioning";

  const [updatedRoom] = await db
    .update(roomInstances)
    .set({
      state: nextState,
      roomLink: nextRoomLink,
      pid: launch.pid,
      processStartedAt: launch.processStartedAt,
      invocationId: launch.invocationId,
      logPath: launch.logPath,
      updatedAt: new Date().toISOString()
    })
    .where(eq(roomInstances.id, room.id))
    .returning();

  return toRoomResponse({
    room: updatedRoom,
    program,
    version,
    proxyEndpoint
  });
}

async function resolveProgramVersion(
  versionReference: string,
  programId: number
) {
  if (versionReference !== "latest") {
    const version = await getProgramVersionByProgramAndVersion({
      programId,
      version: versionReference
    });

    if (version) {
      return version;
    }

    const alias = await getProgramVersionAliasByProgramAndAlias({
      programId,
      alias: versionReference
    });

    if (alias) {
      return alias.version;
    }

    throw notFound("Room program version not found");
  }

  const [anyKnownVersion] = await db
    .select()
    .from(roomProgramVersions)
    .where(eq(roomProgramVersions.programId, programId));

  if (!anyKnownVersion) {
    throw badRequest(
      "At least one room program version is required before latest can be resolved"
    );
  }

  const latestKnownVersion = await getLatestProgramVersion(programId);
  const [programRow] = await db
    .select()
    .from(roomPrograms)
    .where(eq(roomPrograms.id, programId));

  if (!programRow) {
    throw notFound("Room program not found");
  }

  const latestRelease = latestStableRelease(
    await listGithubReleases(programRow.releaseSource)
  );

  if (!latestRelease) {
    throw notFound("No stable GitHub release found");
  }

  const existingVersion = await getProgramVersionByProgramAndVersion({
    programId,
    version: latestRelease.tagName
  });

  if (existingVersion) {
    return existingVersion;
  }

  const asset = matchReleaseAsset(
    latestRelease,
    programRow.releaseSource.assetPattern
  );

  if (!asset) {
    throw notFound("Latest GitHub release does not include a launchable asset");
  }

  const [createdVersion] = await db
    .insert(roomProgramVersions)
    .values({
      uuid: crypto.randomUUID(),
      programId,
      version: latestRelease.tagName,
      artifact: {
        releaseId: latestRelease.id,
        tagName: latestRelease.tagName,
        assetName: asset.name,
        assetUrl: asset.downloadUrl,
        publishedAt: latestRelease.publishedAt
      },
      entrypoint: latestKnownVersion?.entrypoint ?? anyKnownVersion.entrypoint,
      installStrategy:
        latestKnownVersion?.installStrategy ?? anyKnownVersion.installStrategy
    })
    .returning();

  return createdVersion;
}

function stringLaunchConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function hashSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function roomApiUrl(): string {
  return `http://${env.host}:${env.port}/api`;
}
