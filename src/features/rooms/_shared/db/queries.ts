import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { matches } from "@/features/matches/db";
import type { RoomInstanceEventInput } from "@/features/rooms/_shared/http/inputs";
import {
  roomInstanceEvents,
  roomInstances,
  roomPrograms,
  roomProgramVersionAliases,
  roomProgramVersions,
  roomProxyEndpoints,
  type RoomInstance,
  type RoomInstanceEvent,
  type RoomProgram,
  type RoomProgramVersionAlias,
  type RoomProgramVersion,
  type RoomProxyEndpoint
} from "@/features/rooms/db";
import { players, type Player } from "@/features/players/db";
import { badRequest, notFound } from "@/shared/http/errors";
import {
  cursorAfter,
  cursorSort,
  isJsonValue,
  pageLimit,
  type PaginationQuery
} from "@lib";
import type { Account } from "@/features/accounts/db";

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
  | "failed"
  | "all"
  | undefined;
export type ListRoomRowsInput = {
  state?: RoomStateFilter;
  pagination?: PaginationQuery;
};
export type GetProgramVersionByProgramAndVersionInput = {
  programId: number;
  version: string;
};
export type RoomVersionAliasRow = {
  alias: RoomProgramVersionAlias;
  version: RoomProgramVersion;
};
export type RoomInstanceEventRow = RoomInstanceEvent & {
  actorPlayer: Player | null;
  actorAccount: Account | null;
  subjectPlayer: Player | null;
  subjectAccount: Account | null;
  matchPublicId: string | null;
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
    .where(
      and(
        roomStateWhere(input.state),
        cursorAfter(roomInstances.id, input.pagination?.cursor, "desc")
      )
    )
    .orderBy(cursorSort(roomInstances.id, "desc"))
    .limit(pageLimit(input.pagination));

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

export async function addRoomInstanceEvent(
  roomUuid: string,
  input: RoomInstanceEventInput
): Promise<RoomInstanceEventRow> {
  const room = await getRoomInstance(roomUuid);

  validateRoomInstanceEventInput(input);

  if (!isJsonValue(input.value)) {
    throw badRequest("Event value must be valid JSON");
  }

  const [actorPlayer, subjectPlayer, match] = await Promise.all([
    input.actorPlayerId ? getPlayerByExternalId(input.actorPlayerId) : null,
    input.subjectPlayerId ? getPlayerByExternalId(input.subjectPlayerId) : null,
    input.matchId ? getMatchByPublicId(input.matchId) : null
  ]);
  const sequence = await nextRoomInstanceEventSequence(room.id);

  await db.insert(roomInstanceEvents).values({
    uuid: crypto.randomUUID(),
    roomInstanceId: room.id,
    matchId: match?.id ?? null,
    sequence,
    domain: input.domain,
    type: input.type,
    scope: input.scope,
    actorPlayerId: actorPlayer?.id ?? null,
    subjectPlayerId: subjectPlayer?.id ?? null,
    team: input.team ?? null,
    roomPlayerId: input.roomPlayerId ?? null,
    playId: input.playId ?? null,
    sourceState: input.sourceState ?? null,
    value: input.value,
    occurredAt: input.occurredAt ?? null,
    elapsedSeconds: input.elapsedSeconds ?? null,
    tick: input.tick ?? null
  });

  const event = (await listRoomInstanceEventRows(roomUuid)).find(
    (row) => row.sequence === sequence
  );

  if (!event) {
    throw notFound("Room event not found");
  }

  return event;
}

export async function listRoomInstanceEventRows(
  roomUuid: string,
  query?: PaginationQuery
): Promise<RoomInstanceEventRow[]> {
  const room = await getRoomInstance(roomUuid);
  const rows = await db
    .select()
    .from(roomInstanceEvents)
    .where(
      and(
        eq(roomInstanceEvents.roomInstanceId, room.id),
        cursorAfter(roomInstanceEvents.sequence, query?.cursor, "asc")
      )
    )
    .orderBy(cursorSort(roomInstanceEvents.sequence, "asc"))
    .limit(query ? pageLimit(query) : -1);

  return hydrateRoomInstanceEvents(rows);
}

export async function listOpenRoomInstances(): Promise<RoomInstance[]> {
  return db
    .select()
    .from(roomInstances)
    .where(inArray(roomInstances.state, ["provisioning", "running"]));
}

async function getRoomInstance(uuid: string): Promise<RoomInstance> {
  const [room] = await db
    .select()
    .from(roomInstances)
    .where(eq(roomInstances.uuid, uuid));

  if (!room) {
    throw notFound("Room not found");
  }

  return room;
}

async function getPlayerByExternalId(externalId: string): Promise<Player> {
  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.externalId, externalId));

  if (!player) {
    throw notFound("Player not found");
  }

  return player;
}

async function getMatchByPublicId(
  publicId: string
): Promise<typeof matches.$inferSelect> {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.publicId, publicId));

  if (!match) {
    throw notFound("Match not found");
  }

  return match;
}

async function nextRoomInstanceEventSequence(
  roomInstanceId: number
): Promise<number> {
  const rows = await db
    .select({ sequence: roomInstanceEvents.sequence })
    .from(roomInstanceEvents)
    .where(eq(roomInstanceEvents.roomInstanceId, roomInstanceId))
    .orderBy(desc(roomInstanceEvents.sequence));

  return (rows[0]?.sequence ?? 0) + 1;
}

function validateRoomInstanceEventInput(input: RoomInstanceEventInput): void {
  if (
    input.scope === "player" &&
    !input.actorPlayerId &&
    !input.subjectPlayerId &&
    input.roomPlayerId === undefined
  ) {
    throw badRequest(
      "Player-scoped room events require actorPlayerId, subjectPlayerId, or roomPlayerId"
    );
  }

  if (input.scope === "team" && !input.team) {
    throw badRequest("Team-scoped events require team");
  }
}

async function hydrateRoomInstanceEvents(
  events: RoomInstanceEvent[]
): Promise<RoomInstanceEventRow[]> {
  const playerIds = Array.from(
    new Set(
      events
        .flatMap((event) => [event.actorPlayerId, event.subjectPlayerId])
        .filter((id): id is number => id !== null)
    )
  );
  const matchIds = Array.from(
    new Set(
      events
        .map((event) => event.matchId)
        .filter((id): id is number => id !== null)
    )
  );
  const playerRows =
    playerIds.length > 0
      ? await db
          .select({ player: players, account: accounts })
          .from(players)
          .leftJoin(accounts, eq(players.accountId, accounts.id))
          .where(inArray(players.id, playerIds))
      : [];
  const matchRows =
    matchIds.length > 0
      ? await db.select().from(matches).where(inArray(matches.id, matchIds))
      : [];
  const playerById = new Map(
    playerRows.map((row) => [
      row.player.id,
      { player: row.player, account: row.account }
    ])
  );
  const matchPublicIdById = new Map(
    matchRows.map((match) => [match.id, match.publicId])
  );

  return events.map((event) => {
    const actor = event.actorPlayerId
      ? (playerById.get(event.actorPlayerId) ?? null)
      : null;
    const subject = event.subjectPlayerId
      ? (playerById.get(event.subjectPlayerId) ?? null)
      : null;

    return {
      ...event,
      actorPlayer: actor?.player ?? null,
      actorAccount: actor?.account ?? null,
      subjectPlayer: subject?.player ?? null,
      subjectAccount: subject?.account ?? null,
      matchPublicId: event.matchId
        ? (matchPublicIdById.get(event.matchId) ?? null)
        : null
    };
  });
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

export async function getProgramVersionAliasByProgramAndAlias(input: {
  programId: number;
  alias: string;
}): Promise<RoomVersionAliasRow | null> {
  const rows = await db
    .select({
      alias: roomProgramVersionAliases,
      version: roomProgramVersions
    })
    .from(roomProgramVersionAliases)
    .innerJoin(
      roomProgramVersions,
      eq(roomProgramVersionAliases.versionId, roomProgramVersions.id)
    )
    .where(
      and(
        eq(roomProgramVersionAliases.programId, input.programId),
        eq(roomProgramVersionAliases.alias, input.alias)
      )
    );

  return rows[0] ?? null;
}

export async function listProgramVersionAliases(input: {
  programId: number;
  pagination?: PaginationQuery;
}): Promise<RoomVersionAliasRow[]> {
  return db
    .select({
      alias: roomProgramVersionAliases,
      version: roomProgramVersions
    })
    .from(roomProgramVersionAliases)
    .innerJoin(
      roomProgramVersions,
      eq(roomProgramVersionAliases.versionId, roomProgramVersions.id)
    )
    .where(
      and(
        eq(roomProgramVersionAliases.programId, input.programId),
        cursorAfter(
          roomProgramVersionAliases.id,
          input.pagination?.cursor,
          "asc"
        )
      )
    )
    .orderBy(cursorSort(roomProgramVersionAliases.id, "asc"))
    .limit(pageLimit(input.pagination));
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
    return inArray(roomInstances.state, ["provisioning", "running"]);
  }

  if (state === "all") {
    return undefined;
  }

  return eq(roomInstances.state, state);
}
