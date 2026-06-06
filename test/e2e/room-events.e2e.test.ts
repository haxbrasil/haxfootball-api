import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOM_INSTANCE_EVENT } from "@/test/e2e/helpers/events";
import {
  paginatedBody,
  paginatedItems,
  request
} from "@/test/e2e/helpers/helpers";

type RoomEventResponse = {
  id: string;
  sequence: number;
  domain: "room" | "game" | "agent" | "system";
  type: string;
  scope: "player" | "team" | "match";
  actorPlayer: { id: string } | null;
  subjectPlayer: { id: string } | null;
  team: "spectators" | "red" | "blue" | null;
  roomPlayerId: number | null;
  matchId: string | null;
  value: unknown;
};

type MatchResponse = {
  id: string;
};

type PlayerResponse = {
  id: string;
};

type RoomProgramResponse = {
  id: string;
};

type RoomResponse = {
  id: string;
};

const fixtureRoot = `/tmp/haxfootball-api-room-events-${crypto.randomUUID()}`;
const packageRoot = join(fixtureRoot, "package");
const packageArchive = join(fixtureRoot, "room-events-fixture.tgz");
const launchedRoomIds: string[] = [];

beforeAll(() => {
  createFixturePackage();
});

afterEach(async () => {
  await Promise.all(
    launchedRoomIds.map((roomId) =>
      request(`/api/rooms/${roomId}/close`, { method: "POST" })
    )
  );
  launchedRoomIds.length = 0;
});

afterAll(() => {
  rmSync(fixtureRoot, { force: true, recursive: true });
});

describe("room events", () => {
  it("adds and lists room instance events", async () => {
    const programResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: `events-${crypto.randomUUID().slice(0, 8)}`,
        title: "Room events",
        description: "Room events test program",
        releaseSource: {
          owner: "haxbrasil",
          repo: "room-events",
          assetPattern: "room-{tag}.tgz"
        },
        integrationMode: "external",
        haxballTokenEnvVar: "ROOM_TOKEN"
      }
    });

    expect(programResponse.status).toBe(201);

    const program: RoomProgramResponse = await programResponse.json();
    const versionResponse = await request(
      `/api/room-programs/${program.id}/versions`,
      {
        method: "POST",
        body: {
          version: "v1.0.0",
          artifact: {
            releaseId: "v1.0.0",
            tagName: "v1.0.0",
            assetName: "room-v1.0.0.tgz",
            assetUrl: `file://${packageArchive}`,
            publishedAt: "2026-05-01T00:00:00Z"
          },
          entrypoint: "dist/server.js",
          installStrategy: "none"
        }
      }
    );

    expect(versionResponse.status).toBe(201);

    const launchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "room-events-token",
        launchConfig: {}
      }
    });

    expect(launchResponse.status).toBe(201);

    const room: RoomResponse = await launchResponse.json();
    const roomId = room.id;

    launchedRoomIds.push(roomId);

    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `room-event-player-${crypto.randomUUID()}`,
        name: "room-event-player"
      }
    });

    expect(playerResponse.status).toBe(201);

    const player: PlayerResponse = await playerResponse.json();
    const joinResponse = await request(`/api/rooms/${roomId}/events`, {
      method: "POST",
      body: {
        domain: "room",
        type: ROOM_INSTANCE_EVENT.PlayerJoined,
        scope: "player",
        roomPlayerId: 7,
        value: {
          name: "guest"
        }
      }
    });
    const teamResponse = await request(`/api/rooms/${roomId}/events`, {
      method: "POST",
      body: {
        domain: "room",
        type: ROOM_INSTANCE_EVENT.PlayerTeamChange,
        scope: "player",
        actorPlayerId: player.id,
        roomPlayerId: 8,
        team: "red",
        value: {
          name: "room-event-player"
        }
      }
    });
    const invalidPlayerScopedResponse = await request(
      `/api/rooms/${roomId}/events`,
      {
        method: "POST",
        body: {
          domain: "room",
          type: ROOM_INSTANCE_EVENT.PlayerJoined,
          scope: "player",
          value: {}
        }
      }
    );
    const listResponse = await request(`/api/rooms/${roomId}/events`);
    const unknownRoomResponse = await request(
      `/api/rooms/${crypto.randomUUID()}/events`,
      {
        method: "POST",
        body: {
          domain: "room",
          type: ROOM_INSTANCE_EVENT.PlayerJoined,
          scope: "player",
          roomPlayerId: 1,
          value: {}
        }
      }
    );

    expect(joinResponse.status).toBe(201);
    expect(teamResponse.status).toBe(201);
    expect(invalidPlayerScopedResponse.status).toBe(400);
    expect(await joinResponse.json()).toMatchObject({
      sequence: 1,
      actorPlayer: null,
      roomPlayerId: 7
    });
    expect(await teamResponse.json()).toMatchObject({
      sequence: 2,
      actorPlayer: {
        id: player.id
      },
      team: "red",
      roomPlayerId: 8
    });
    expect(listResponse.status).toBe(200);

    const events = await paginatedItems<RoomEventResponse>(listResponse);

    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(unknownRoomResponse.status).toBe(404);
  });

  it("stores player leave room events without requiring a team", async () => {
    const programResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: `events-${crypto.randomUUID().slice(0, 8)}`,
        title: "Room events",
        description: "Room events test program",
        releaseSource: {
          owner: "haxbrasil",
          repo: "room-events",
          assetPattern: "room-{tag}.tgz"
        },
        integrationMode: "external",
        haxballTokenEnvVar: "ROOM_TOKEN"
      }
    });

    expect(programResponse.status).toBe(201);

    const program: RoomProgramResponse = await programResponse.json();
    const versionResponse = await request(
      `/api/room-programs/${program.id}/versions`,
      {
        method: "POST",
        body: {
          version: "v1.0.0",
          artifact: {
            releaseId: "v1.0.0",
            tagName: "v1.0.0",
            assetName: "room-v1.0.0.tgz",
            assetUrl: `file://${packageArchive}`,
            publishedAt: "2026-05-01T00:00:00Z"
          },
          entrypoint: "dist/server.js",
          installStrategy: "none"
        }
      }
    );

    expect(versionResponse.status).toBe(201);

    const launchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "room-events-token",
        launchConfig: {}
      }
    });

    expect(launchResponse.status).toBe(201);

    const room: RoomResponse = await launchResponse.json();
    const roomId = room.id;

    launchedRoomIds.push(roomId);

    const response = await request(`/api/rooms/${roomId}/events`, {
      method: "POST",
      body: {
        domain: "room",
        type: ROOM_INSTANCE_EVENT.PlayerLeave,
        scope: "player",
        roomPlayerId: 4,
        value: {
          name: "leaver"
        }
      }
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      type: ROOM_INSTANCE_EVENT.PlayerLeave,
      team: null,
      roomPlayerId: 4
    });
  });

  it("hydrates linked match IDs on room instance events", async () => {
    const programResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: `events-${crypto.randomUUID().slice(0, 8)}`,
        title: "Room events",
        description: "Room events test program",
        releaseSource: {
          owner: "haxbrasil",
          repo: "room-events",
          assetPattern: "room-{tag}.tgz"
        },
        integrationMode: "external",
        haxballTokenEnvVar: "ROOM_TOKEN"
      }
    });

    expect(programResponse.status).toBe(201);

    const program: RoomProgramResponse = await programResponse.json();
    const versionResponse = await request(
      `/api/room-programs/${program.id}/versions`,
      {
        method: "POST",
        body: {
          version: "v1.0.0",
          artifact: {
            releaseId: "v1.0.0",
            tagName: "v1.0.0",
            assetName: "room-v1.0.0.tgz",
            assetUrl: `file://${packageArchive}`,
            publishedAt: "2026-05-01T00:00:00Z"
          },
          entrypoint: "dist/server.js",
          installStrategy: "none"
        }
      }
    );

    expect(versionResponse.status).toBe(201);

    const launchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "room-events-token",
        launchConfig: {}
      }
    });

    expect(launchResponse.status).toBe(201);

    const room: RoomResponse = await launchResponse.json();
    const roomId = room.id;

    launchedRoomIds.push(roomId);

    const matchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        initiatedAt: "2026-06-06T12:00:00.000Z"
      }
    });

    expect(matchResponse.status).toBe(201);

    const match: MatchResponse = await matchResponse.json();
    const response = await request(`/api/rooms/${roomId}/events`, {
      method: "POST",
      body: {
        domain: "room",
        type: ROOM_INSTANCE_EVENT.PlayerJoined,
        scope: "player",
        roomPlayerId: 9,
        matchId: match.id,
        value: {}
      }
    });
    const listResponse = await request(`/api/rooms/${roomId}/events`);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      matchId: match.id
    });

    const events = await paginatedItems<RoomEventResponse>(listResponse);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      matchId: match.id
    });
  });

  it("paginates room instance events by sequence", async () => {
    const programResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: `events-${crypto.randomUUID().slice(0, 8)}`,
        title: "Room events",
        description: "Room events test program",
        releaseSource: {
          owner: "haxbrasil",
          repo: "room-events",
          assetPattern: "room-{tag}.tgz"
        },
        integrationMode: "external",
        haxballTokenEnvVar: "ROOM_TOKEN"
      }
    });

    expect(programResponse.status).toBe(201);

    const program: RoomProgramResponse = await programResponse.json();
    const versionResponse = await request(
      `/api/room-programs/${program.id}/versions`,
      {
        method: "POST",
        body: {
          version: "v1.0.0",
          artifact: {
            releaseId: "v1.0.0",
            tagName: "v1.0.0",
            assetName: "room-v1.0.0.tgz",
            assetUrl: `file://${packageArchive}`,
            publishedAt: "2026-05-01T00:00:00Z"
          },
          entrypoint: "dist/server.js",
          installStrategy: "none"
        }
      }
    );

    expect(versionResponse.status).toBe(201);

    const launchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "room-events-token",
        launchConfig: {}
      }
    });

    expect(launchResponse.status).toBe(201);

    const room: RoomResponse = await launchResponse.json();
    const roomId = room.id;

    launchedRoomIds.push(roomId);

    for (const roomPlayerId of [1, 2, 3]) {
      const response = await request(`/api/rooms/${roomId}/events`, {
        method: "POST",
        body: {
          domain: "room",
          type: ROOM_INSTANCE_EVENT.PlayerJoined,
          scope: "player",
          roomPlayerId,
          value: {}
        }
      });

      expect(response.status).toBe(201);
    }

    const firstPageResponse = await request(
      `/api/rooms/${roomId}/events?limit=2`
    );
    const firstPage = await paginatedBody<RoomEventResponse>(firstPageResponse);

    expect(firstPage.items.map((event) => event.sequence)).toEqual([1, 2]);
    expect(firstPage.page.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await request(
      `/api/rooms/${roomId}/events?limit=2&cursor=${encodeURIComponent(
        firstPage.page.nextCursor ?? ""
      )}`
    );
    const secondPage =
      await paginatedBody<RoomEventResponse>(secondPageResponse);

    expect(secondPage.items.map((event) => event.sequence)).toEqual([3]);
    expect(secondPage.page.nextCursor).toBe(null);
  });

  it("rejects team-scoped room events without a team", async () => {
    const programResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: `events-${crypto.randomUUID().slice(0, 8)}`,
        title: "Room events",
        description: "Room events test program",
        releaseSource: {
          owner: "haxbrasil",
          repo: "room-events",
          assetPattern: "room-{tag}.tgz"
        },
        integrationMode: "external",
        haxballTokenEnvVar: "ROOM_TOKEN"
      }
    });

    expect(programResponse.status).toBe(201);

    const program: RoomProgramResponse = await programResponse.json();
    const versionResponse = await request(
      `/api/room-programs/${program.id}/versions`,
      {
        method: "POST",
        body: {
          version: "v1.0.0",
          artifact: {
            releaseId: "v1.0.0",
            tagName: "v1.0.0",
            assetName: "room-v1.0.0.tgz",
            assetUrl: `file://${packageArchive}`,
            publishedAt: "2026-05-01T00:00:00Z"
          },
          entrypoint: "dist/server.js",
          installStrategy: "none"
        }
      }
    );

    expect(versionResponse.status).toBe(201);

    const launchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "room-events-token",
        launchConfig: {}
      }
    });

    expect(launchResponse.status).toBe(201);

    const room: RoomResponse = await launchResponse.json();
    const roomId = room.id;

    launchedRoomIds.push(roomId);

    const response = await request(`/api/rooms/${roomId}/events`, {
      method: "POST",
      body: {
        domain: "room",
        type: ROOM_INSTANCE_EVENT.PlayerTeamChange,
        scope: "team",
        value: {}
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Team-scoped events require team"
      }
    });
  });
});

function createFixturePackage(): void {
  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "room-events-fixture", version: "1.0.0" })
  );
  writeFileSync(
    join(packageRoot, "dist/server.js"),
    `
console.log("room ready https://www.haxball.com/play?c=events");
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
`
  );

  execFileSync("tar", ["-czf", packageArchive, "-C", packageRoot, "."]);
}
