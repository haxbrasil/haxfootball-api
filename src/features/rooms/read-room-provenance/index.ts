import { eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/client";
import {
  roomInstances,
  roomPrograms,
  roomProgramVersions
} from "@/features/rooms/core-db";

export type RoomProgramProvenance = {
  room: {
    uuid: string;
  };
  championshipContextUuid: string | null;
  program: {
    uuid: string;
    name: string;
    title: string | null;
  };
  version: {
    uuid: string;
    version: string;
  };
};

export async function readRoomProgramProvenance(
  database: DatabaseExecutor,
  roomInstanceIds: number[]
): Promise<Map<number, RoomProgramProvenance>> {
  const ids = [...new Set(roomInstanceIds)];

  if (ids.length === 0) {
    return new Map();
  }

  const rows = await database
    .select({
      roomId: roomInstances.id,
      roomUuid: roomInstances.uuid,
      launchConfig: roomInstances.launchConfig,
      programUuid: roomPrograms.uuid,
      programName: roomPrograms.name,
      programTitle: roomPrograms.title,
      versionUuid: roomProgramVersions.uuid,
      version: roomProgramVersions.version
    })
    .from(roomInstances)
    .innerJoin(roomPrograms, eq(roomInstances.programId, roomPrograms.id))
    .innerJoin(
      roomProgramVersions,
      eq(roomInstances.versionId, roomProgramVersions.id)
    )
    .where(inArray(roomInstances.id, ids));

  return new Map(
    rows.map((row) => [
      row.roomId,
      {
        room: { uuid: row.roomUuid },
        championshipContextUuid: championshipContextUuid(row.launchConfig),
        program: {
          uuid: row.programUuid,
          name: row.programName,
          title: row.programTitle
        },
        version: {
          uuid: row.versionUuid,
          version: row.version
        }
      }
    ])
  );
}

function championshipContextUuid(
  launchConfig: Record<string, string | number | boolean | null>
) {
  const value = launchConfig.championshipContextUuid;
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
    ? value
    : null;
}
