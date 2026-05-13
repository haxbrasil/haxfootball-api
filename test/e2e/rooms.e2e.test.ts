import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import {
  paginatedItems,
  rawRequest,
  request
} from "@/test/e2e/helpers/helpers";

type FixtureEnv = Record<string, string | undefined>;

type RoomProgramIdOnly = {
  id: string;
};

type RoomEndpointIdOnly = {
  id: string;
};

type RoomVersionSummary = {
  version: string;
};

type RoomStateSummary = {
  id: string;
  state: string;
};

type RoomIdSummary = {
  id: string;
};

type ProgramReleaseSource = {
  owner: string;
  repo: string;
  assetPattern: string;
};

type LaunchConfigFieldInput = Record<string, unknown>;

type RoomLaunchConfigPayload = Record<string, unknown>;

type LaunchConfigFieldSummary = {
  key: string;
  envVar: string;
  secret: boolean;
};

type RoomProxyEndpointSummary = {
  id: string;
  key: string;
  proxyUrl: string;
};

type RoomProgramResponse = {
  id: string;
  name: string;
  title: string | null;
  description: string | null;
  releaseSource: ProgramReleaseSource;
  launchConfigFields: LaunchConfigFieldSummary[];
  supportsManualLinking: boolean;
  haxballTokenEnvVar: string;
};

type RoomProxyResponse = {
  id: string;
  key: string;
  displayName: string;
  outboundIp: string;
  proxyUrl: string;
  enabled: boolean;
};

type RoomVersionResponse = {
  id: string;
  programId: string;
  version: string;
  artifact: RoomVersionArtifactResponse;
  nodeEntrypoint: string;
  installStrategy: string;
};

type RoomLaunchResponse = {
  id: string;
  state: string;
  roomLink: string | null;
  public: boolean;
  proxyEndpoint: RoomProxyEndpointSummary | null;
  launchConfig: RoomLaunchConfigPayload;
};

type CreateRoomProgramInput = {
  name?: string;
  title?: string;
  description?: string;
  releaseSource?: ProgramReleaseSource;
  launchConfigFields?: LaunchConfigFieldInput[];
  supportsManualLinking?: boolean;
  haxballTokenEnvVar?: string;
};

type CreateRoomProgramVersionInput = {
  nodeEntrypoint?: string;
  installStrategy?: "none" | "npm-ci" | "npm-install";
  assetUrl?: string;
  publishedAt?: string;
};

type CreateRoomProxyInput = {
  key: string;
  outboundIp: string;
};

type LaunchRoomInput = {
  programId: string;
  launchConfig: RoomLaunchConfigPayload;
};

type ReleaseFixtureInput = {
  prerelease?: boolean;
  draft?: boolean;
  assetNames?: string[];
};

type RoomVersionArtifactResponse = {
  releaseId: string;
  tagName: string;
  assetName: string;
  assetUrl: string;
  publishedAt: string;
};

const fixtureBaseUrl = new URL(
  Bun.env.ROOM_GITHUB_API_BASE_URL ?? "http://127.0.0.1:19081"
);
const fixtureRoot = `/tmp/haxfootball-api-room-fixtures-${crypto.randomUUID()}`;
const packageRoot = join(fixtureRoot, "package");
const packageArchive = join(fixtureRoot, "room-fixture.tgz");
const testRepoBase = "haxbrasil/test-room";
const emptyRepoBase = "haxbrasil/empty-room";
const singleRepoBase = "haxbrasil/single-room";
const latestRepoBase = "haxbrasil/latest-room";

let fixtureServer: ReturnType<typeof Bun.serve> | undefined;
let assetRequests = 0;

beforeAll(() => {
  createFixturePackage();

  fixtureServer = Bun.serve({
    port: Number(fixtureBaseUrl.port),
    fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === `/repos/${testRepoBase}/releases`) {
        return Response.json([
          release("stable-latest", "v2.0.0", "2026-05-05T00:00:00Z"),
          release("stable-old", "v1.0.0", "2026-05-01T00:00:00Z"),
          release("prerelease", "v9.0.0-beta", "2026-05-07T00:00:00Z", {
            prerelease: true
          }),
          release("draft", "v3.0.0-rc.1", "2026-05-08T00:00:00Z", {
            draft: true
          }),
          release("missing-asset", "v4.0.0", "2026-05-09T00:00:00Z", {
            assetNames: []
          })
        ]);
      }

      if (url.pathname === `/repos/${emptyRepoBase}/releases`) {
        return Response.json([]);
      }

      if (url.pathname === `/repos/${singleRepoBase}/releases`) {
        return Response.json([
          release("single-stable", "v1.0.0", "2026-05-01T00:00:00Z")
        ]);
      }

      if (url.pathname === `/repos/${latestRepoBase}/releases`) {
        return Response.json([
          release("latest-prerelease", "v9.0.0-beta", "2026-05-07T00:00:00Z", {
            prerelease: true
          }),
          release("latest-stable", "v2.0.0", "2026-05-05T00:00:00Z"),
          release("latest-old", "v1.0.0", "2026-05-01T00:00:00Z")
        ]);
      }

      if (url.pathname.startsWith("/assets/")) {
        assetRequests += 1;

        return new Response(Bun.file(packageArchive), {
          headers: {
            "content-type": "application/gzip"
          }
        });
      }

      return new Response("Not found", { status: 404 });
    }
  });
});

afterAll(async () => {
  await fixtureServer?.stop(true);
  rmSync(fixtureRoot, { force: true, recursive: true });
});

describe("rooms", () => {
  it("creates, lists, gets, and updates room programs", async () => {
    const alpha = await createProgram({
      name: uniqueName("alpha"),
      title: "Alpha program",
      description: "First room program",
      haxballTokenEnvVar: "ROOM_ALPHA_TOKEN"
    });
    const zeta = await createProgram({
      name: uniqueName("zeta"),
      title: "Zeta program",
      description: "Second room program",
      supportsManualLinking: true,
      haxballTokenEnvVar: "ROOM_ZETA_TOKEN",
      launchConfigFields: [
        {
          key: "arenaName",
          displayName: "Arena name",
          valueType: "string",
          required: false,
          defaultValue: "academy",
          secret: false,
          envVar: "ARENA_NAME"
        }
      ]
    });

    const listResponse = await request("/api/room-programs");
    const getResponse = await request(`/api/room-programs/${zeta.id}`);
    const updateResponse = await request(`/api/room-programs/${alpha.id}`, {
      method: "PATCH",
      body: {
        title: "Alpha updated",
        description: null,
        releaseSource: {
          owner: "haxbrasil",
          repo: "latest-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [
          {
            key: "roomName",
            displayName: "Room title",
            valueType: "string",
            required: false,
            secret: false,
            envVar: "ROOM_TITLE"
          },
          {
            key: "maxPlayers",
            displayName: "Max players",
            valueType: "number",
            required: false,
            defaultValue: 8,
            minimum: 1,
            maximum: 30,
            secret: false,
            envVar: "MAX_PLAYERS"
          }
        ],
        supportsManualLinking: true,
        haxballTokenEnvVar: "ROOM_ALPHA_ACCESS_TOKEN"
      }
    });
    const refetchResponse = await request(`/api/room-programs/${alpha.id}`);
    const duplicateResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: alpha.name,
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        }
      }
    });

    expect(listResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(refetchResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(400);

    const programs = await paginatedItems<
      RoomProgramIdOnly & RoomProgramResponse
    >(listResponse);
    const alphaIndex = programs.findIndex(
      (program: RoomProgramIdOnly) => program.id === alpha.id
    );
    const zetaIndex = programs.findIndex(
      (program: RoomProgramIdOnly) => program.id === zeta.id
    );

    expect(alphaIndex).toBeGreaterThanOrEqual(0);
    expect(zetaIndex).toBeGreaterThan(alphaIndex);
    expect(programs[alphaIndex]).toMatchObject({
      id: alpha.id,
      name: alpha.name,
      title: "Alpha program",
      description: "First room program",
      supportsManualLinking: false,
      haxballTokenEnvVar: "ROOM_ALPHA_TOKEN",
      launchConfigFields: expect.arrayContaining([
        expect.objectContaining({
          key: "roomName",
          envVar: "ROOM_NAME"
        }),
        expect.objectContaining({
          key: "proxy",
          envVar: "PROXY"
        }),
        expect.objectContaining({
          key: "roomPublic",
          envVar: "ROOM_PUBLIC"
        })
      ])
    });
    expect(await getResponse.json()).toMatchObject({
      id: zeta.id,
      name: zeta.name,
      title: "Zeta program",
      description: "Second room program",
      supportsManualLinking: true,
      haxballTokenEnvVar: "ROOM_ZETA_TOKEN",
      launchConfigFields: expect.arrayContaining([
        expect.objectContaining({
          key: "arenaName",
          displayName: "Arena name",
          envVar: "ARENA_NAME"
        })
      ])
    });
    expect(await updateResponse.json()).toMatchObject({
      id: alpha.id,
      title: "Alpha updated",
      description: null,
      releaseSource: {
        repo: "latest-room"
      },
      launchConfigFields: expect.arrayContaining([
        expect.objectContaining({
          key: "roomName",
          envVar: "ROOM_TITLE"
        }),
        expect.objectContaining({
          key: "maxPlayers",
          defaultValue: 8,
          envVar: "MAX_PLAYERS"
        })
      ]),
      supportsManualLinking: true,
      haxballTokenEnvVar: "ROOM_ALPHA_ACCESS_TOKEN"
    });
    expect(await refetchResponse.json()).toMatchObject({
      id: alpha.id,
      title: "Alpha updated",
      description: null,
      releaseSource: {
        repo: "latest-room"
      },
      supportsManualLinking: true,
      haxballTokenEnvVar: "ROOM_ALPHA_ACCESS_TOKEN"
    });
    expect(await duplicateResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Room program name already exists"
      }
    });
  });

  it("creates, lists, updates, and validates room proxy endpoints", async () => {
    const alpha = await createProxy({
      key: "proxy-alpha",
      outboundIp: "10.0.0.181"
    });
    const zeta = await createProxy({
      key: "proxy-zeta",
      outboundIp: "10.0.0.131"
    });

    const listResponse = await request("/api/room-proxy-endpoints");
    const updateResponse = await request(
      `/api/room-proxy-endpoints/${alpha.id}`,
      {
        method: "PATCH",
        body: {
          displayName: "Proxy alpha updated",
          outboundIp: "10.0.0.210",
          proxyUrl: "http://10.0.0.210:8888",
          enabled: false
        }
      }
    );
    const duplicateResponse = await request("/api/room-proxy-endpoints", {
      method: "POST",
      body: {
        key: alpha.key,
        displayName: "Duplicate",
        outboundIp: "10.0.0.211",
        proxyUrl: "http://10.0.0.211:8888"
      }
    });

    expect(listResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(400);

    const endpoints = await paginatedItems<RoomProxyResponse>(listResponse);
    const alphaIndex = endpoints.findIndex(
      (endpoint: RoomEndpointIdOnly) => endpoint.id === alpha.id
    );
    const zetaIndex = endpoints.findIndex(
      (endpoint: RoomEndpointIdOnly) => endpoint.id === zeta.id
    );

    expect(alphaIndex).toBeGreaterThanOrEqual(0);
    expect(zetaIndex).toBeGreaterThan(alphaIndex);
    expect(endpoints[alphaIndex]).toMatchObject({
      id: alpha.id,
      key: alpha.key,
      displayName: alpha.displayName,
      outboundIp: alpha.outboundIp,
      proxyUrl: alpha.proxyUrl,
      enabled: true
    });
    expect(await updateResponse.json()).toMatchObject({
      id: alpha.id,
      displayName: "Proxy alpha updated",
      outboundIp: "10.0.0.210",
      proxyUrl: "http://10.0.0.210:8888",
      enabled: false
    });
    expect(await duplicateResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Room proxy endpoint key already exists"
      }
    });
  });

  it("validates room program, version, proxy, and launch input", async () => {
    const invalidProgramResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: "Invalid Name",
        title: "Broken",
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        }
      }
    });
    const invalidProgramFieldsResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: uniqueName("bad-fields"),
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [
          {
            key: "roomName",
            displayName: "Room name",
            valueType: "number",
            required: false,
            defaultValue: "wrong",
            secret: false,
            envVar: "ROOM_NAME"
          }
        ]
      }
    });
    const duplicateLaunchKeyResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: uniqueName("bad-duplicate-key"),
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [
          {
            key: "mode",
            displayName: "Mode",
            valueType: "string",
            required: false,
            secret: false,
            envVar: "ROOM_MODE"
          },
          {
            key: "mode",
            displayName: "Mode duplicate",
            valueType: "string",
            required: false,
            secret: false,
            envVar: "ROOM_MODE_DUPLICATE"
          }
        ]
      }
    });
    const duplicateLaunchEnvResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: uniqueName("bad-duplicate-env"),
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [
          {
            key: "mode",
            displayName: "Mode",
            valueType: "string",
            required: false,
            secret: false,
            envVar: "ROOM_MODE"
          },
          {
            key: "players",
            displayName: "Players",
            valueType: "number",
            required: false,
            secret: false,
            envVar: "ROOM_MODE"
          }
        ]
      }
    });
    const invalidEnumFieldResponse = await request("/api/room-programs", {
      method: "POST",
      body: {
        name: uniqueName("bad-enum"),
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [
          {
            key: "players",
            displayName: "Players",
            valueType: "number",
            required: false,
            enumValues: ["8"],
            secret: false,
            envVar: "ROOM_PLAYERS"
          }
        ]
      }
    });
    const invalidProxyResponse = await request("/api/room-proxy-endpoints", {
      method: "POST",
      body: {
        key: "bad key",
        displayName: "Proxy",
        outboundIp: "10.0.0.181",
        proxyUrl: "http://10.0.0.181:8888"
      }
    });

    expect(invalidProgramResponse.status).toBe(400);
    expect(invalidProgramFieldsResponse.status).toBe(400);
    expect(duplicateLaunchKeyResponse.status).toBe(400);
    expect(duplicateLaunchEnvResponse.status).toBe(400);
    expect(invalidEnumFieldResponse.status).toBe(400);
    expect(invalidProxyResponse.status).toBe(400);
    expect(await invalidProgramResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
    expect(await invalidProgramFieldsResponse.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Launch config default value type does not match field"
      }
    });
    expect(await duplicateLaunchKeyResponse.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Launch config field keys must be unique"
      }
    });
    expect(await duplicateLaunchEnvResponse.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Launch config environment variables must be unique"
      }
    });
    expect(await invalidEnumFieldResponse.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Launch config enum fields must use string values"
      }
    });
    expect(await invalidProxyResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });

    const program = await createProgram({
      releaseSource: {
        owner: "haxbrasil",
        repo: "empty-room",
        assetPattern: "room-{tag}.tgz"
      },
      launchConfigFields: [
        {
          key: "mode",
          displayName: "Mode",
          valueType: "string",
          required: true,
          enumValues: ["arcade", "league"],
          secret: false,
          envVar: "ROOM_MODE"
        },
        {
          key: "players",
          displayName: "Players",
          valueType: "number",
          required: false,
          defaultValue: 8,
          minimum: 2,
          maximum: 10,
          secret: false,
          envVar: "ROOM_PLAYERS"
        }
      ]
    });
    const version = await createVersion(program.id, "v1.0.0", {
      installStrategy: undefined
    });

    expect(version).toMatchObject({
      programId: program.id,
      version: "v1.0.0",
      artifact: {
        tagName: "v1.0.0",
        assetName: "room-v1.0.0.tgz"
      },
      nodeEntrypoint: "dist/server.js",
      installStrategy: "none"
    });
    const defaultVersionProgram = await createProgram();
    const defaultVersionResponse = await request(
      `/api/room-programs/${defaultVersionProgram.id}/versions`,
      {
        method: "POST",
        body: {
          version: "v1.0.0",
          artifact: {
            releaseId: "v1.0.0",
            tagName: "v1.0.0",
            assetName: "room-v1.0.0.tgz",
            assetUrl: `${fixtureBaseUrl}/assets/room-v1.0.0.tgz`,
            publishedAt: "2026-05-01T00:00:00Z"
          },
          nodeEntrypoint: "dist/server.js"
        }
      }
    );

    expect(defaultVersionResponse.status).toBe(201);
    expect(await defaultVersionResponse.json()).toMatchObject({
      installStrategy: "npm-ci"
    });

    const duplicateVersionResponse = await request(
      `/api/room-programs/${program.id}/versions`,
      {
        method: "POST",
        body: {
          version: "v1.0.0",
          artifact: {
            releaseId: "v1.0.0",
            tagName: "v1.0.0",
            assetName: "room-v1.0.0.tgz",
            assetUrl: `${fixtureBaseUrl}/assets/room-v1.0.0.tgz`,
            publishedAt: "2026-05-01T00:00:00Z"
          },
          nodeEntrypoint: "dist/server.js",
          installStrategy: "none"
        }
      }
    );
    const missingProgramResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: crypto.randomUUID(),
        version: "v1.0.0",
        haxballToken: "token"
      }
    });
    const missingVersionResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v2.0.0",
        haxballToken: "token"
      }
    });
    const missingLatestResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "latest",
        haxballToken: "token"
      }
    });
    const missingLaunchFieldResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "token",
        launchConfig: {
          players: 9
        }
      }
    });
    const invalidEnumResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "token",
        launchConfig: {
          mode: "sim",
          players: 9
        }
      }
    });
    const invalidRangeResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "token",
        launchConfig: {
          mode: "arcade",
          players: 1
        }
      }
    });
    const invalidTypeResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "token",
        launchConfig: {
          mode: "arcade",
          players: "many"
        }
      }
    });
    const invalidMaximumResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "token",
        launchConfig: {
          mode: "arcade",
          players: 11
        }
      }
    });

    expect(duplicateVersionResponse.status).toBe(400);
    expect(missingProgramResponse.status).toBe(404);
    expect(missingVersionResponse.status).toBe(404);
    expect(missingLatestResponse.status).toBe(404);
    expect(missingLaunchFieldResponse.status).toBe(400);
    expect(invalidEnumResponse.status).toBe(400);
    expect(invalidRangeResponse.status).toBe(400);
    expect(invalidTypeResponse.status).toBe(400);
    expect(invalidMaximumResponse.status).toBe(400);
    expect(await duplicateVersionResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Room program version already exists"
      }
    });
    expect(await missingLaunchFieldResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Launch config field 'mode' is required"
      }
    });
    expect(await invalidEnumResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Launch config field 'mode' has invalid value"
      }
    });
    expect(await invalidRangeResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Launch config field 'players' is below minimum"
      }
    });
    expect(await invalidTypeResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Launch config field 'players' has invalid type"
      }
    });
    expect(await invalidMaximumResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Launch config field 'players' is above maximum"
      }
    });
  });

  it("discovers GitHub releases, skips missing or unstable releases, and respects the launch cache", async () => {
    const program = await createProgram({
      releaseSource: {
        owner: "haxbrasil",
        repo: "test-room",
        assetPattern: "room-{tag}.tgz"
      },
      launchConfigFields: [
        {
          key: "envCapture",
          displayName: "Environment capture",
          valueType: "string",
          required: true,
          secret: true,
          envVar: "ROOM_E2E_ENV_OUT"
        }
      ]
    });
    await createVersion(program.id, "v1.0.0");

    const discoverResponse = await request(
      `/api/room-programs/${program.id}/versions/discover`,
      {
        method: "POST",
        body: {
          nodeEntrypoint: "dist/server.js",
          installStrategy: "none"
        }
      }
    );
    const versionsResponse = await request(
      `/api/room-programs/${program.id}/versions`
    );
    const repeatedDiscoverResponse = await request(
      `/api/room-programs/${program.id}/versions/discover`,
      {
        method: "POST",
        body: {
          nodeEntrypoint: "dist/server.js"
        }
      }
    );

    expect(discoverResponse.status).toBe(201);
    expect(versionsResponse.status).toBe(200);
    expect(repeatedDiscoverResponse.status).toBe(201);

    const discoveredVersions = await discoverResponse.json();
    const versions = await paginatedItems<RoomVersionSummary>(versionsResponse);
    const repeatedDiscoveredVersions = await repeatedDiscoverResponse.json();

    expect(discoveredVersions).toHaveLength(2);
    expect(
      discoveredVersions.map((version: RoomVersionSummary) => version.version)
    ).toEqual(["v2.0.0", "v9.0.0-beta"]);
    expect(
      discoveredVersions.find(
        (version: RoomVersionSummary) => version.version === "v2.0.0"
      )
    ).toMatchObject({
      artifact: {
        tagName: "v2.0.0",
        assetName: "room-v2.0.0.tgz"
      }
    });
    expect(
      discoveredVersions.find(
        (version: RoomVersionSummary) => version.version === "v9.0.0-beta"
      )
    ).toMatchObject({
      artifact: {
        tagName: "v9.0.0-beta",
        assetName: "room-v9.0.0-beta.tgz"
      }
    });
    expect(
      versions.map((version: RoomVersionSummary) => version.version)
    ).toEqual(["v1.0.0", "v2.0.0", "v9.0.0-beta"]);
    expect(repeatedDiscoveredVersions).toEqual([]);

    const latestProgram = await createProgram({
      releaseSource: {
        owner: "haxbrasil",
        repo: "latest-room",
        assetPattern: "room-{tag}.tgz"
      },
      launchConfigFields: [
        {
          key: "envCapture",
          displayName: "Environment capture",
          valueType: "string",
          required: true,
          secret: true,
          envVar: "ROOM_E2E_ENV_OUT"
        }
      ]
    });
    await createVersion(latestProgram.id, "v1.0.0");

    assetRequests = 0;

    const firstEnvPath = fixtureEnvPath();
    const firstLaunchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: latestProgram.id,
        version: "latest",
        haxballToken: "latest-token",
        launchConfig: {
          envCapture: firstEnvPath
        }
      }
    });

    expect(firstLaunchResponse.status).toBe(201);
    const firstRoom = await firstLaunchResponse.json();
    expect(firstRoom).toMatchObject({
      state: "running",
      version: {
        version: "v2.0.0"
      }
    });
    expect(await readFixtureEnv(firstEnvPath)).toMatchObject({
      ROOM_E2E_ENV_OUT: firstEnvPath
    });

    const secondEnvPath = fixtureEnvPath();
    const secondLaunchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: latestProgram.id,
        version: "latest",
        haxballToken: "latest-token",
        launchConfig: {
          envCapture: secondEnvPath
        }
      }
    });

    expect(secondLaunchResponse.status).toBe(201);
    const secondRoom = await secondLaunchResponse.json();
    expect(secondRoom).toMatchObject({
      state: "running",
      version: {
        version: "v2.0.0"
      }
    });
    expect(assetRequests).toBe(1);
    await closeRoom(firstRoom.id);
    await closeRoom(secondRoom.id);

    const latestVersionsResponse = await request(
      `/api/room-programs/${latestProgram.id}/versions`
    );

    expect(latestVersionsResponse.status).toBe(200);
    expect(
      (await paginatedItems<RoomVersionSummary>(latestVersionsResponse)).map(
        (version) => version.version
      )
    ).toEqual(["v1.0.0", "v2.0.0"]);

    const emptyProgram = await createProgram({
      releaseSource: {
        owner: "haxbrasil",
        repo: "empty-room",
        assetPattern: "room-{tag}.tgz"
      }
    });
    await createVersion(emptyProgram.id, "v1.0.0");

    const emptyLatestResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: emptyProgram.id,
        version: "latest",
        haxballToken: "token"
      }
    });

    expect(emptyLatestResponse.status).toBe(404);
    expect(await emptyLatestResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "No stable GitHub release found"
      }
    });

    const missingAssetProgram = await createProgram({
      releaseSource: {
        owner: "haxbrasil",
        repo: "test-room",
        assetPattern: "room-{tag}.tgz"
      }
    });
    await createVersion(missingAssetProgram.id, "v1.0.0");

    const missingAssetLatestResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: missingAssetProgram.id,
        version: "latest",
        haxballToken: "token"
      }
    });

    expect(missingAssetLatestResponse.status).toBe(404);
    expect(await missingAssetLatestResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Latest GitHub release does not include a launchable asset"
      }
    });

    const noKnownVersionProgram = await createProgram({
      releaseSource: {
        owner: "haxbrasil",
        repo: "single-room",
        assetPattern: "room-{tag}.tgz"
      }
    });
    const noKnownVersionLatestResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: noKnownVersionProgram.id,
        version: "latest",
        haxballToken: "token"
      }
    });

    expect(noKnownVersionLatestResponse.status).toBe(400);
    expect(await noKnownVersionLatestResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message:
          "At least one room program version is required before latest can be resolved"
      }
    });
  });

  it("launches rooms with default launch config mapping and custom token env vars", async () => {
    const envPath = fixtureEnvPath();
    const program = await createProgram({
      supportsManualLinking: false,
      haxballTokenEnvVar: "ROOM_SESSION_TOKEN",
      launchConfigFields: [
        {
          key: "envCapture",
          displayName: "Environment capture",
          valueType: "string",
          required: true,
          secret: true,
          envVar: "ROOM_E2E_ENV_OUT"
        }
      ]
    });
    await createVersion(program.id, "v1.0.0");

    const launchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "launch-only-token",
        launchConfig: {
          roomName: "Sunday session",
          envCapture: envPath
        }
      }
    });

    expect(launchResponse.status).toBe(201);

    const room = (await launchResponse.json()) as RoomLaunchResponse;
    const capturedEnv = await readFixtureEnv(envPath);

    expect(room).toMatchObject({
      state: "running",
      roomLink: "https://www.haxball.com/play?c=fixture123",
      public: true,
      launchConfig: {
        roomName: "Sunday session",
        roomPublic: true,
        envCapture: null
      }
    });
    expect(capturedEnv).toMatchObject({
      ROOM_NAME: "Sunday session",
      ROOM_PUBLIC: "1",
      ROOM_SESSION_TOKEN: "launch-only-token",
      ROOM_E2E_ENV_OUT: envPath,
      __ROOM_API_URL: "http://0.0.0.0:3000/api",
      __ROOM_API_JWT: expect.any(String)
    });
    expect(capturedEnv.ROOM_TOKEN).toBeUndefined();
    expect(capturedEnv.ROOM_API_URL).toBeUndefined();
    expect(capturedEnv.ROOM_API_JWT).toBeUndefined();
    expect(capturedEnv.ROOM_COMM_ID).toBeUndefined();
    expect(JSON.stringify(room)).not.toContain("launch-only-token");
    expect(JSON.stringify(room)).not.toContain(envPath);
    const readyResponse = await request(`/api/rooms/${room.id}/ready`, {
      method: "POST",
      body: {
        commId: "room-comm-id-room-comm-id-room-comm-id",
        roomLink: "https://www.haxball.com/play?c=automatic"
      }
    });

    expect(readyResponse.status).toBe(400);
    expect(await readyResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Room program does not support manual linking"
      }
    });
    await closeRoom(room.id);
  });

  it("passes overridden default launch config mappings and custom defaults", async () => {
    const envPath = fixtureEnvPath();
    const program = await createProgram({
      launchConfigFields: [
        {
          key: "roomName",
          displayName: "Room title",
          valueType: "string",
          required: false,
          secret: false,
          envVar: "ROOM_TITLE"
        },
        {
          key: "roomPublic",
          displayName: "Visible",
          valueType: "boolean",
          required: false,
          defaultValue: false,
          secret: false,
          envVar: "ROOM_IS_PUBLIC"
        },
        {
          key: "maxPlayers",
          displayName: "Max players",
          valueType: "number",
          required: false,
          defaultValue: 12,
          minimum: 2,
          maximum: 30,
          secret: false,
          envVar: "MAX_PLAYERS"
        },
        {
          key: "envCapture",
          displayName: "Environment capture",
          valueType: "string",
          required: true,
          secret: true,
          envVar: "ROOM_E2E_ENV_OUT"
        }
      ]
    });
    await createVersion(program.id, "v1.0.0");

    const launchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "token",
        launchConfig: {
          roomName: "Mapped session",
          envCapture: envPath
        }
      }
    });

    expect(launchResponse.status).toBe(201);

    const room = (await launchResponse.json()) as RoomLaunchResponse;
    const capturedEnv = await readFixtureEnv(envPath);

    expect(room).toMatchObject({
      public: false,
      launchConfig: {
        roomName: "Mapped session",
        roomPublic: false,
        maxPlayers: 12,
        envCapture: null
      }
    });
    expect(capturedEnv).toMatchObject({
      ROOM_TITLE: "Mapped session",
      ROOM_IS_PUBLIC: "0",
      MAX_PLAYERS: "12"
    });
    expect(capturedEnv.ROOM_NAME).toBeUndefined();
    expect(capturedEnv.ROOM_PUBLIC).toBeUndefined();
    await closeRoom(room.id);
  });

  it("launches manual-link rooms and reports readiness only with the matching comm ID", async () => {
    const envPath = fixtureEnvPath();
    const program = await createProgram({
      supportsManualLinking: true,
      launchConfigFields: [
        {
          key: "envCapture",
          displayName: "Environment capture",
          valueType: "string",
          required: true,
          secret: true,
          envVar: "ROOM_E2E_ENV_OUT"
        },
        {
          key: "autoLink",
          displayName: "Automatic link",
          valueType: "string",
          required: false,
          defaultValue: "0",
          secret: false,
          envVar: "AUTO_LINK"
        }
      ]
    });
    await createVersion(program.id, "v1.0.0");

    const launchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "manual-token",
        launchConfig: {
          roomPublic: false,
          envCapture: envPath
        }
      }
    });

    expect(launchResponse.status).toBe(201);

    const room = (await launchResponse.json()) as RoomLaunchResponse;
    const capturedEnv = await readFixtureEnv(envPath);
    const commId = capturedEnv.ROOM_COMM_ID;
    const roomApiJwt = capturedEnv.ROOM_API_JWT ?? "";

    expect(room).toMatchObject({
      state: "provisioning",
      roomLink: null,
      public: false,
      launchConfig: {
        roomPublic: false,
        autoLink: "0",
        envCapture: null
      }
    });
    expect(capturedEnv).toMatchObject({
      ROOM_PUBLIC: "0",
      ROOM_API_URL: "http://0.0.0.0:3000/api",
      ROOM_API_JWT: expect.any(String),
      ROOM_COMM_ID: expect.any(String),
      __ROOM_API_URL: "http://0.0.0.0:3000/api",
      __ROOM_API_JWT: expect.any(String)
    });
    expect(capturedEnv.ROOM_NAME).toBeUndefined();
    expect(capturedEnv.ROOM_TOKEN).toBe("manual-token");
    expect(commId).toEqual(expect.any(String));

    const missingAuthReadyResponse = await rawRequest(
      `/api/rooms/${room.id}/ready`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          commId,
          roomLink: "https://www.haxball.com/play?c=manual123"
        })
      }
    );
    const wrongReadyResponse = await request(`/api/rooms/${room.id}/ready`, {
      method: "POST",
      body: {
        commId: "wrong-comm-id-wrong-comm-id-wrong-comm-id",
        roomLink: "https://www.haxball.com/play?c=manual123"
      }
    });
    const readyResponse = await rawRequest(`/api/rooms/${room.id}/ready`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${roomApiJwt.trim()}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        commId,
        roomLink: "https://www.haxball.com/play?c=manual123"
      })
    });
    const roomResponse = await request(`/api/rooms/${room.id}`);

    expect(missingAuthReadyResponse.status).toBe(401);
    expect(wrongReadyResponse.status).toBe(400);
    expect(await missingAuthReadyResponse.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid bearer token"
      }
    });
    expect(await wrongReadyResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid room communication ID"
      }
    });
    expect(readyResponse.status).toBe(200);
    expect(await readyResponse.json()).toMatchObject({
      state: "running",
      roomLink: "https://www.haxball.com/play?c=manual123"
    });
    const readyRoom = await roomResponse.json();

    expect(roomResponse.status).toBe(200);
    expect(readyRoom).toMatchObject({
      id: room.id,
      state: "running",
      roomLink: "https://www.haxball.com/play?c=manual123"
    });
    expect(JSON.stringify(readyRoom)).not.toContain("manual-token");
    expect(JSON.stringify(readyRoom)).not.toContain(String(commId));
    expect(JSON.stringify(readyRoom)).not.toContain(roomApiJwt);
    await closeRoom(room.id);
  });

  it("tracks runtime lifecycle for delayed links, no links, exits, and close signals", async () => {
    await disableAllProxyEndpoints();

    const program = await createProgram({
      launchConfigFields: [
        {
          key: "envCapture",
          displayName: "Environment capture",
          valueType: "string",
          required: true,
          secret: true,
          envVar: "ROOM_E2E_ENV_OUT"
        },
        {
          key: "autoLink",
          displayName: "Automatic link",
          valueType: "string",
          required: false,
          secret: false,
          envVar: "AUTO_LINK"
        },
        {
          key: "autoLinkDelay",
          displayName: "Automatic link delay",
          valueType: "number",
          required: false,
          secret: false,
          envVar: "AUTO_LINK_DELAY_MS"
        },
        {
          key: "exitAfterEnvCapture",
          displayName: "Exit after env capture",
          valueType: "boolean",
          required: false,
          secret: false,
          envVar: "EXIT_AFTER_ENV_CAPTURE"
        },
        {
          key: "sigtermOut",
          displayName: "SIGTERM output",
          valueType: "string",
          required: false,
          secret: true,
          envVar: "SIGTERM_OUT"
        }
      ]
    });
    await createVersion(program.id, "v1.0.0");

    const delayedRoom = await launchRoom({
      programId: program.id,
      launchConfig: {
        envCapture: fixtureEnvPath(),
        autoLinkDelay: 100
      }
    });
    const reconciledLinkRoom = await launchRoom({
      programId: program.id,
      launchConfig: {
        envCapture: fixtureEnvPath(),
        autoLinkDelay: 800
      }
    });
    const noLinkRoom = await launchRoom({
      programId: program.id,
      launchConfig: {
        envCapture: fixtureEnvPath(),
        autoLink: "0"
      }
    });
    const exitedRoom = await launchRoom({
      programId: program.id,
      launchConfig: {
        envCapture: fixtureEnvPath(),
        autoLink: "0",
        exitAfterEnvCapture: true
      }
    });
    const sigtermPath = join(fixtureRoot, `${crypto.randomUUID()}.sigterm`);
    const signalRoom = await launchRoom({
      programId: program.id,
      launchConfig: {
        envCapture: fixtureEnvPath(),
        sigtermOut: sigtermPath
      }
    });

    expect(delayedRoom).toMatchObject({
      state: "running",
      roomLink: "https://www.haxball.com/play?c=fixture123"
    });
    expect(reconciledLinkRoom).toMatchObject({
      state: "provisioning",
      roomLink: null
    });
    expect(noLinkRoom).toMatchObject({
      state: "provisioning",
      roomLink: null
    });
    expect(exitedRoom).toMatchObject({
      state: "provisioning",
      roomLink: null
    });

    const reconciledExitedRoom = await waitForRoomState(
      exitedRoom.id,
      "closed"
    );
    const reconciledRunningRoom = await waitForRoomState(
      reconciledLinkRoom.id,
      "running"
    );
    const signalCloseResponse = await request(
      `/api/rooms/${signalRoom.id}/close`,
      {
        method: "POST"
      }
    );

    expect(reconciledExitedRoom).toMatchObject({
      state: "closed",
      closedAt: expect.any(String)
    });
    expect(reconciledRunningRoom).toMatchObject({
      roomLink: "https://www.haxball.com/play?c=fixture123"
    });
    expect(signalCloseResponse.status).toBe(200);
    expect(await signalCloseResponse.json()).toMatchObject({
      id: signalRoom.id,
      state: "closed"
    });
    await waitForFile(sigtermPath);

    await closeRoom(delayedRoom.id);
    await closeRoom(reconciledLinkRoom.id);
    await closeRoom(noLinkRoom.id);
  });

  it("assigns proxies by capacity, preserves public slots, and honors explicit overrides", async () => {
    const program = await createProgram({
      launchConfigFields: [
        {
          key: "envCapture",
          displayName: "Environment capture",
          valueType: "string",
          required: true,
          secret: true,
          envVar: "ROOM_E2E_ENV_OUT"
        }
      ]
    });
    await createVersion(program.id, "v1.0.0");
    await disableAllProxyEndpoints();

    const noProxyRoom = await launchRoom({
      programId: program.id,
      launchConfig: {
        envCapture: fixtureEnvPath()
      }
    });

    expect(noProxyRoom.proxyEndpoint).toBeNull();
    expect(noProxyRoom.launchConfig.proxy).toBeUndefined();
    await closeRoom(noProxyRoom.id);

    const proxyAlpha = await createProxy({
      key: "proxy-alpha-capacity",
      outboundIp: "10.0.0.241"
    });
    const proxyBeta = await createProxy({
      key: "proxy-beta-capacity",
      outboundIp: "10.0.0.242"
    });
    const proxyGamma = await createProxy({
      key: "proxy-gamma-disabled",
      outboundIp: "10.0.0.243"
    });

    const explicitKeyRoom = await launchRoom({
      programId: program.id,
      launchConfig: {
        roomPublic: false,
        proxy: proxyAlpha.key,
        envCapture: fixtureEnvPath()
      }
    });
    const explicitIdRoom = await launchRoom({
      programId: program.id,
      launchConfig: {
        roomPublic: false,
        proxy: proxyBeta.id,
        envCapture: fixtureEnvPath()
      }
    });
    const disableGammaResponse = await request(
      `/api/room-proxy-endpoints/${proxyGamma.id}`,
      {
        method: "PATCH",
        body: {
          enabled: false
        }
      }
    );
    const disabledProxyResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "token",
        launchConfig: {
          roomPublic: false,
          proxy: proxyGamma.key,
          envCapture: fixtureEnvPath()
        }
      }
    });

    expect(explicitKeyRoom.proxyEndpoint).toMatchObject({
      id: proxyAlpha.id,
      key: proxyAlpha.key
    });
    expect(explicitIdRoom.proxyEndpoint).toMatchObject({
      id: proxyBeta.id,
      key: proxyBeta.key
    });
    expect(disableGammaResponse.status).toBe(200);
    expect(disabledProxyResponse.status).toBe(400);
    expect(await disabledProxyResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Requested proxy endpoint is not available"
      }
    });
    await closeRoom(explicitKeyRoom.id);
    await closeRoom(explicitIdRoom.id);

    const firstPrivate = await launchRoom({
      programId: program.id,
      launchConfig: {
        roomPublic: false,
        envCapture: fixtureEnvPath()
      }
    });
    const secondPrivate = await launchRoom({
      programId: program.id,
      launchConfig: {
        roomPublic: false,
        envCapture: fixtureEnvPath()
      }
    });
    const publicRoom = await launchRoom({
      programId: program.id,
      launchConfig: {
        roomPublic: true,
        envCapture: fixtureEnvPath()
      }
    });
    const explicitOverride = await launchRoom({
      programId: program.id,
      launchConfig: {
        roomPublic: false,
        proxy: proxyBeta.proxyUrl,
        envCapture: fixtureEnvPath()
      }
    });

    expect(firstPrivate.proxyEndpoint).toMatchObject({
      id: proxyAlpha.id,
      proxyUrl: proxyAlpha.proxyUrl
    });
    expect(secondPrivate.proxyEndpoint).toMatchObject({
      id: proxyAlpha.id,
      proxyUrl: proxyAlpha.proxyUrl
    });
    expect(publicRoom.proxyEndpoint).toMatchObject({
      id: proxyBeta.id,
      proxyUrl: proxyBeta.proxyUrl
    });
    expect(explicitOverride.proxyEndpoint).toMatchObject({
      id: proxyBeta.id,
      proxyUrl: proxyBeta.proxyUrl
    });
    expect(explicitOverride.launchConfig.proxy).toBe(proxyBeta.proxyUrl);

    const exhaustedPublicResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: program.id,
        version: "v1.0.0",
        haxballToken: "token",
        launchConfig: {
          roomPublic: true,
          envCapture: fixtureEnvPath()
        }
      }
    });

    expect(exhaustedPublicResponse.status).toBe(400);
    expect(await exhaustedPublicResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "No proxy endpoint has available HaxBall capacity"
      }
    });

    await closeRoom(firstPrivate.id);
    await closeRoom(secondPrivate.id);
    await closeRoom(publicRoom.id);
    await closeRoom(explicitOverride.id);
  });

  it("lists rooms by lifecycle state and closes them idempotently", async () => {
    const automaticProgram = await createProgram({
      launchConfigFields: [
        {
          key: "envCapture",
          displayName: "Environment capture",
          valueType: "string",
          required: true,
          secret: true,
          envVar: "ROOM_E2E_ENV_OUT"
        }
      ]
    });
    await createVersion(automaticProgram.id, "v1.0.0");

    const manualProgram = await createProgram({
      supportsManualLinking: true,
      launchConfigFields: [
        {
          key: "envCapture",
          displayName: "Environment capture",
          valueType: "string",
          required: true,
          secret: true,
          envVar: "ROOM_E2E_ENV_OUT"
        },
        {
          key: "autoLink",
          displayName: "Automatic link",
          valueType: "string",
          required: false,
          defaultValue: "0",
          secret: false,
          envVar: "AUTO_LINK"
        }
      ]
    });
    await createVersion(manualProgram.id, "v1.0.0");

    const runningRoom = await launchRoom({
      programId: automaticProgram.id,
      launchConfig: {
        envCapture: fixtureEnvPath()
      }
    });
    const provisioningEnvPath = fixtureEnvPath();
    const provisioningLaunchResponse = await request("/api/rooms", {
      method: "POST",
      body: {
        programId: manualProgram.id,
        version: "v1.0.0",
        haxballToken: "manual-token",
        launchConfig: {
          roomPublic: false,
          envCapture: provisioningEnvPath
        }
      }
    });

    expect(provisioningLaunchResponse.status).toBe(201);

    const provisioningRoom = await provisioningLaunchResponse.json();
    const provisioningEnv = await readFixtureEnv(provisioningEnvPath);
    const commId = provisioningEnv.ROOM_COMM_ID;

    const openResponse = await request("/api/rooms");
    const runningResponse = await request("/api/rooms?state=running");
    const provisioningResponse = await request("/api/rooms?state=provisioning");
    const allResponse = await request("/api/rooms?state=all");

    expect(openResponse.status).toBe(200);
    expect(runningResponse.status).toBe(200);
    expect(provisioningResponse.status).toBe(200);
    expect(allResponse.status).toBe(200);
    const openRooms = await paginatedItems<RoomStateSummary>(openResponse);
    const runningRooms =
      await paginatedItems<RoomStateSummary>(runningResponse);
    const provisioningRooms =
      await paginatedItems<RoomStateSummary>(provisioningResponse);
    const allRooms = await paginatedItems<RoomIdSummary>(allResponse);

    expect(
      openRooms.some(
        (room: RoomStateSummary) =>
          room.id === runningRoom.id && room.state === "running"
      )
    ).toBe(true);
    expect(
      openRooms.some(
        (room: RoomStateSummary) =>
          room.id === provisioningRoom.id && room.state === "provisioning"
      )
    ).toBe(true);
    expect(
      runningRooms.some(
        (room: RoomStateSummary) =>
          room.id === runningRoom.id && room.state === "running"
      )
    ).toBe(true);
    expect(
      provisioningRooms.some(
        (room: RoomStateSummary) =>
          room.id === provisioningRoom.id && room.state === "provisioning"
      )
    ).toBe(true);
    expect(
      allRooms.some((room: RoomIdSummary) => room.id === runningRoom.id)
    ).toBe(true);
    expect(
      allRooms.some((room: RoomIdSummary) => room.id === provisioningRoom.id)
    ).toBe(true);

    const closeFirstResponse = await request(
      `/api/rooms/${runningRoom.id}/close`,
      {
        method: "POST"
      }
    );
    const closeSecondResponse = await request(
      `/api/rooms/${runningRoom.id}/close`,
      {
        method: "POST"
      }
    );
    const getClosedResponse = await request(`/api/rooms/${runningRoom.id}`);
    const closeManualResponse = await request(
      `/api/rooms/${provisioningRoom.id}/close`,
      {
        method: "POST"
      }
    );
    const readyAfterCloseResponse = await request(
      `/api/rooms/${provisioningRoom.id}/ready`,
      {
        method: "POST",
        body: {
          commId,
          roomLink: "https://www.haxball.com/play?c=manual-after-close"
        }
      }
    );
    const closedListResponse = await request("/api/rooms?state=closed");
    const openAfterCloseResponse = await request("/api/rooms");

    expect(closeFirstResponse.status).toBe(200);
    expect(closeSecondResponse.status).toBe(200);
    expect(closeManualResponse.status).toBe(200);
    expect(readyAfterCloseResponse.status).toBe(400);
    const openAfterClose = await paginatedItems<RoomIdSummary>(
      openAfterCloseResponse
    );
    expect(await closeSecondResponse.json()).toMatchObject({
      id: runningRoom.id,
      state: "closed"
    });
    expect(await getClosedResponse.json()).toMatchObject({
      id: runningRoom.id,
      state: "closed",
      closedAt: expect.any(String)
    });
    const closedRooms =
      await paginatedItems<RoomStateSummary>(closedListResponse);
    expect(
      closedRooms.some(
        (room: RoomStateSummary) =>
          room.id === runningRoom.id && room.state === "closed"
      )
    ).toBe(true);
    expect(
      closedRooms.some(
        (room: RoomStateSummary) =>
          room.id === provisioningRoom.id && room.state === "closed"
      )
    ).toBe(true);
    expect(openAfterClose).not.toContainEqual(
      expect.objectContaining({
        id: runningRoom.id
      })
    );
    expect(openAfterClose).not.toContainEqual(
      expect.objectContaining({
        id: provisioningRoom.id
      })
    );
    expect(await readyAfterCloseResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Closed room cannot be marked ready"
      }
    });
  });

  it("returns not found for unknown room resources", async () => {
    const unknownUuid = crypto.randomUUID();

    const getProgramResponse = await request(
      `/api/room-programs/${unknownUuid}`
    );
    const listVersionsResponse = await request(
      `/api/room-programs/${unknownUuid}/versions`
    );
    const updateProxyResponse = await request(
      `/api/room-proxy-endpoints/${unknownUuid}`,
      {
        method: "PATCH",
        body: {
          displayName: "Missing"
        }
      }
    );
    const getRoomResponse = await request(`/api/rooms/${unknownUuid}`);
    const closeRoomResponse = await request(`/api/rooms/${unknownUuid}/close`, {
      method: "POST"
    });
    const readyRoomResponse = await request(`/api/rooms/${unknownUuid}/ready`, {
      method: "POST",
      body: {
        commId: "room-comm-id-room-comm-id-room-comm-id",
        roomLink: "https://www.haxball.com/play?c=missing"
      }
    });

    expect(getProgramResponse.status).toBe(404);
    expect(listVersionsResponse.status).toBe(404);
    expect(updateProxyResponse.status).toBe(404);
    expect(getRoomResponse.status).toBe(404);
    expect(closeRoomResponse.status).toBe(404);
    expect(readyRoomResponse.status).toBe(404);
    expect(await getProgramResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Room program not found"
      }
    });
    expect(await listVersionsResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Room program not found"
      }
    });
    expect(await updateProxyResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Room proxy endpoint not found"
      }
    });
    expect(await getRoomResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Room not found"
      }
    });
    expect(await closeRoomResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Room not found"
      }
    });
    expect(await readyRoomResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Room not found"
      }
    });
  });
});

async function createProgram(
  input: CreateRoomProgramInput = {}
): Promise<RoomProgramResponse> {
  const response = await request("/api/room-programs", {
    method: "POST",
    body: {
      name: input.name ?? uniqueName("program"),
      title: input.title ?? "Test program",
      description: input.description ?? "Test program description",
      releaseSource: input.releaseSource ?? {
        owner: "haxbrasil",
        repo: "test-room",
        assetPattern: "room-{tag}.tgz"
      },
      launchConfigFields: input.launchConfigFields,
      supportsManualLinking: input.supportsManualLinking ?? false,
      haxballTokenEnvVar: input.haxballTokenEnvVar
    }
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<RoomProgramResponse>;
}

async function createVersion(
  programId: string,
  version: string,
  input: CreateRoomProgramVersionInput = {}
): Promise<RoomVersionResponse> {
  const response = await request(`/api/room-programs/${programId}/versions`, {
    method: "POST",
    body: {
      version,
      artifact: {
        releaseId: version,
        tagName: version,
        assetName: `room-${version}.tgz`,
        assetUrl:
          input.assetUrl ?? `${fixtureBaseUrl}/assets/room-${version}.tgz`,
        publishedAt: input.publishedAt ?? "2026-05-01T00:00:00Z"
      },
      nodeEntrypoint: input.nodeEntrypoint ?? "dist/server.js",
      installStrategy: input.installStrategy ?? "none"
    }
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<RoomVersionResponse>;
}

async function createProxy(
  input: CreateRoomProxyInput
): Promise<RoomProxyResponse> {
  const response = await request("/api/room-proxy-endpoints", {
    method: "POST",
    body: {
      key: uniqueName(input.key),
      displayName: input.key,
      outboundIp: input.outboundIp,
      proxyUrl: `http://${input.outboundIp}:8888`
    }
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<RoomProxyResponse>;
}

async function launchRoom(input: LaunchRoomInput): Promise<RoomLaunchResponse> {
  const response = await request("/api/rooms", {
    method: "POST",
    body: {
      programId: input.programId,
      version: "v1.0.0",
      haxballToken: "token",
      launchConfig: input.launchConfig
    }
  });

  expect(response.status).toBe(201);

  return response.json() as Promise<RoomLaunchResponse>;
}

async function closeRoom(roomId: string): Promise<void> {
  const response = await request(`/api/rooms/${roomId}/close`, {
    method: "POST"
  });

  expect(response.status).toBe(200);
}

async function disableAllProxyEndpoints(): Promise<void> {
  const response = await request("/api/room-proxy-endpoints");

  expect(response.status).toBe(200);

  const endpoints = await paginatedItems<RoomProxyResponse>(response);

  for (const endpoint of endpoints) {
    const updateResponse = await request(
      `/api/room-proxy-endpoints/${endpoint.id}`,
      {
        method: "PATCH",
        body: {
          enabled: false
        }
      }
    );

    expect(updateResponse.status).toBe(200);
  }
}

function createFixturePackage(): void {
  mkdirSync(join(packageRoot, "dist"), { recursive: true });

  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "room-fixture", version: "1.0.0" })
  );

  writeFileSync(
    join(packageRoot, "dist/server.js"),
    `
const { writeFileSync } = require("node:fs");
const outputPath = process.env.ROOM_E2E_ENV_OUT;

if (outputPath) {
  writeFileSync(outputPath, JSON.stringify(process.env));
}

if (process.env.EXIT_AFTER_ENV_CAPTURE === "1") {
  process.exit(0);
}

if (process.env.AUTO_LINK !== "0" && process.env.AUTO_LINK_DELAY_MS) {
  setTimeout(() => {
    console.log("room ready https://www.haxball.com/play?c=fixture123");
  }, Number(process.env.AUTO_LINK_DELAY_MS));
} else if (process.env.AUTO_LINK !== "0") {
  console.log("room ready https://www.haxball.com/play?c=fixture123");
}

process.on("SIGTERM", () => {
  if (process.env.SIGTERM_OUT) {
    writeFileSync(process.env.SIGTERM_OUT, "terminated");
  }

  process.exit(0);
});
setInterval(() => {}, 1000);
`
  );

  execFileSync("tar", ["-czf", packageArchive, "-C", packageRoot, "."]);
}

function release(
  id: string,
  tagName: string,
  publishedAt: string,
  input: ReleaseFixtureInput = {}
) {
  const assetNames = input.assetNames ?? [`room-${tagName}.tgz`];

  return {
    id,
    tag_name: tagName,
    prerelease: input.prerelease ?? false,
    draft: input.draft ?? false,
    published_at: publishedAt,
    assets: assetNames.map((name) => ({
      name,
      browser_download_url: `${fixtureBaseUrl}/assets/${name}`
    }))
  };
}

async function readFixtureEnv(path: string): Promise<FixtureEnv> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  throw new Error("Room fixture did not write environment file");
}

async function waitForRoomState(
  roomId: string,
  state: string
): Promise<RoomLaunchResponse> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await request(`/api/rooms/${roomId}`);

    expect(response.status).toBe(200);

    const room = (await response.json()) as RoomLaunchResponse;

    if (room.state === state) {
      return room;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Room ${roomId} did not reach state ${state}`);
}

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (existsSync(path)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`File was not written: ${path}`);
}

function fixtureEnvPath(): string {
  return join(fixtureRoot, `${crypto.randomUUID()}.env.json`);
}

function uniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
