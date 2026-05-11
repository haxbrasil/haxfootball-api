import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  roomInstances,
  roomPrograms,
  roomProgramVersions,
  roomProxyEndpoints,
  type RoomInstance,
  type RoomProgram,
  type RoomProgramVersion,
  type RoomProxyEndpoint
} from "@/features/rooms/room.db";
import { notFound } from "@/shared/http/errors";

export type RoomRow = {
  room: RoomInstance;
  program: RoomProgram;
  version: RoomProgramVersion;
  proxyEndpoint: RoomProxyEndpoint | null;
};
export type RoomStateFilter =
  | "open"
  | "provisioning"
  | "running"
  | "closed"
  | "all"
  | undefined;
export type ListRoomRowsInput = {
  state?: RoomStateFilter;
};
export type GetProgramVersionByProgramAndVersionInput = {
  programId: number;
  version: string;
};

export async function getRoomProgramByUuid(uuid: string): Promise<RoomProgram> {
  const [program] = await db
    .select()
    .from(roomPrograms)
    .where(eq(roomPrograms.uuid, uuid));

  if (!program) {
    throw notFound("Room program not found");
  }

  return program;
}

export async function getRoomProgramVersionByUuid(
  uuid: string
): Promise<RoomProgramVersion> {
  const [version] = await db
    .select()
    .from(roomProgramVersions)
    .where(eq(roomProgramVersions.uuid, uuid));

  if (!version) {
    throw notFound("Room program version not found");
  }

  return version;
}

export async function getRoomProxyEndpointByUuid(
  uuid: string
): Promise<RoomProxyEndpoint> {
  const [endpoint] = await db
    .select()
    .from(roomProxyEndpoints)
    .where(eq(roomProxyEndpoints.uuid, uuid));

  if (!endpoint) {
    throw notFound("Room proxy endpoint not found");
  }

  return endpoint;
}

export async function listRoomRows(
  input: ListRoomRowsInput
): Promise<RoomRow[]> {
  const rows = await db
    .select({
      room: roomInstances,
      program: roomPrograms,
      version: roomProgramVersions,
      proxyEndpoint: roomProxyEndpoints
    })
    .from(roomInstances)
    .innerJoin(roomPrograms, eq(roomInstances.programId, roomPrograms.id))
    .innerJoin(
      roomProgramVersions,
      eq(roomInstances.versionId, roomProgramVersions.id)
    )
    .leftJoin(
      roomProxyEndpoints,
      eq(roomInstances.proxyEndpointId, roomProxyEndpoints.id)
    )
    .where(roomStateWhere(input.state))
    .orderBy(desc(roomInstances.createdAt));

  return rows;
}

export async function getRoomRow(uuid: string): Promise<RoomRow> {
  const rows = await db
    .select({
      room: roomInstances,
      program: roomPrograms,
      version: roomProgramVersions,
      proxyEndpoint: roomProxyEndpoints
    })
    .from(roomInstances)
    .innerJoin(roomPrograms, eq(roomInstances.programId, roomPrograms.id))
    .innerJoin(
      roomProgramVersions,
      eq(roomInstances.versionId, roomProgramVersions.id)
    )
    .leftJoin(
      roomProxyEndpoints,
      eq(roomInstances.proxyEndpointId, roomProxyEndpoints.id)
    )
    .where(eq(roomInstances.uuid, uuid));

  const [row] = rows;

  if (!row) {
    throw notFound("Room not found");
  }

  return row;
}

export async function listOpenRoomInstances(): Promise<RoomInstance[]> {
  return db
    .select()
    .from(roomInstances)
    .where(inArray(roomInstances.state, ["provisioning", "running"]));
}

export async function listEnabledProxyEndpoints(): Promise<
  RoomProxyEndpoint[]
> {
  return db
    .select()
    .from(roomProxyEndpoints)
    .where(eq(roomProxyEndpoints.enabled, true));
}

export async function getProgramVersionByProgramAndVersion(
  input: GetProgramVersionByProgramAndVersionInput
): Promise<RoomProgramVersion | null> {
  const [version] = await db
    .select()
    .from(roomProgramVersions)
    .where(
      and(
        eq(roomProgramVersions.programId, input.programId),
        eq(roomProgramVersions.version, input.version)
      )
    );

  return version ?? null;
}

export async function getLatestProgramVersion(
  programId: number
): Promise<RoomProgramVersion | null> {
  const [version] = await db
    .select()
    .from(roomProgramVersions)
    .where(eq(roomProgramVersions.programId, programId))
    .orderBy(desc(roomProgramVersions.createdAt));

  return version ?? null;
}

function roomStateWhere(state: RoomStateFilter) {
  if (!state || state === "open") {
    return ne(roomInstances.state, "closed");
  }

  if (state === "all") {
    return undefined;
  }

  return eq(roomInstances.state, state);
}
