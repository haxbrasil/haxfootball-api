import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { setupInternalTestDatabase } from "@/test/internal/helpers/database";

beforeAll(async () => {
  await setupInternalTestDatabase();
});

describe("room internals", () => {
  it("forces public room launch config private only when the policy is enabled", async () => {
    const { buildEffectiveRoomEnvironment, resolveLaunchConfig } =
      await import("@/features/rooms/_shared/domain/launch-config");

    const fields = [
      {
        key: "roomPublic",
        label: "room.launch.field.public-room",
        category: "room" as const,
        valueType: "boolean" as const,
        required: false,
        defaultValue: true,
        secret: false,
        envVar: "ROOM_PUBLIC"
      }
    ];

    const defaultResolution = resolveLaunchConfig({
      fields,
      values: {
        roomPublic: true
      },
      assignedProxy: null,
      publicPolicy: "default"
    });
    const forcedResolution = resolveLaunchConfig({
      fields,
      values: {
        roomPublic: true
      },
      assignedProxy: null,
      publicPolicy: "force-private"
    });

    expect(defaultResolution).toMatchObject({
      sanitizedLaunchConfig: {
        roomPublic: true
      },
      environmentValues: {
        roomPublic: true
      },
      publicRoom: true
    });
    expect(forcedResolution).toMatchObject({
      sanitizedLaunchConfig: {
        roomPublic: false
      },
      environmentValues: {
        roomPublic: false
      },
      publicRoom: false
    });
    const externalEnvironment = buildEffectiveRoomEnvironment({
      program: {
        id: 1,
        uuid: crypto.randomUUID(),
        name: "test",
        title: null,
        description: null,
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: fields,
        liveStateContract: null,
        integrationMode: "external",
        haxballTokenEnvVar: "TOKEN",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      fields,
      environmentValues: forcedResolution.environmentValues,
      haxballToken: "token",
      roomId: crypto.randomUUID(),
      roomApiUrl: "http://localhost/api",
      roomApiJwt: "jwt",
      commId: "comm"
    });

    expect(externalEnvironment.ROOM_PUBLIC).toBe("0");
    expect(externalEnvironment.__ROOM_API_URL).toBeUndefined();
    expect(externalEnvironment.__ROOM_API_JWT).toBeUndefined();
    expect(externalEnvironment.__ROOM_ID).toBeUndefined();
    expect(externalEnvironment.__ROOM_COMM_ID).toBeUndefined();

    const integratedEnvironment = buildEffectiveRoomEnvironment({
      program: {
        id: 1,
        uuid: crypto.randomUUID(),
        name: "test-integrated",
        title: null,
        description: null,
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: fields,
        liveStateContract: null,
        integrationMode: "integrated",
        haxballTokenEnvVar: "TOKEN",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      fields,
      environmentValues: forcedResolution.environmentValues,
      haxballToken: "token",
      roomId: "room-id",
      roomApiUrl: "http://localhost/api",
      roomApiJwt: "jwt",
      commId: "comm"
    });

    expect(integratedEnvironment).toMatchObject({
      __ROOM_API_URL: "http://localhost/api",
      __ROOM_API_JWT: "jwt",
      __ROOM_ID: "room-id",
      __ROOM_COMM_ID: "comm"
    });
    expect(integratedEnvironment.ROOM_API_URL).toBeUndefined();
    expect(integratedEnvironment.ROOM_API_JWT).toBeUndefined();
    expect(integratedEnvironment.ROOM_COMM_ID).toBeUndefined();
  });

  it("stores validated live room snapshots and exposes generic state facts", async () => {
    const { connectLiveRoom, replaceLiveRoomSnapshot } =
      await import("@/features/live-state/_shared/domain/registry");
    const { liveStateGraphql } = await import("@/features/live-state/graphql");
    const roomId = crypto.randomUUID();
    const contract = {
      namespace: "test-room",
      documents: [
        {
          name: "session",
          version: 1,
          schema: {
            type: "object",
            properties: {
              registeredPlayers: { type: "number" },
              acceptingRegistrations: { type: "boolean" }
            },
            required: ["registeredPlayers", "acceptingRegistrations"]
          }
        }
      ],
      facts: [
        {
          key: "registered-players",
          type: "number" as const,
          document: "session",
          pointer: "/registeredPlayers"
        },
        {
          key: "accepting-registrations",
          type: "boolean" as const,
          document: "session",
          pointer: "/acceptingRegistrations"
        }
      ]
    };

    connectLiveRoom({
      roomId,
      contract,
      connection: {
        send: () => {}
      }
    });

    expect(() =>
      replaceLiveRoomSnapshot(roomId, {
        revision: 1,
        room: {
          name: "Invalid",
          teamsLocked: null,
          gameStatus: "running",
          scores: null
        },
        players: [],
        stateDocuments: [
          {
            name: "session",
            version: 1,
            payload: {
              registeredPlayers: "wrong",
              acceptingRegistrations: true
            }
          }
        ]
      })
    ).toThrow("Invalid live state document payload 'session'");

    replaceLiveRoomSnapshot(roomId, {
      revision: 2,
      room: {
        name: "Live test",
        teamsLocked: false,
        gameStatus: "running",
        scores: {
          red: 7,
          blue: 3
        }
      },
      players: [
        {
          roomPlayerId: 1,
          name: "Gabriel",
          team: "red",
          admin: true,
          avatar: null,
          desynced: false,
          sessionKind: "signed-in",
          playable: true,
          playBlockedReason: null
        }
      ],
      stateDocuments: [
        {
          name: "session",
          version: 1,
          payload: {
            registeredPlayers: 12,
            acceptingRegistrations: false
          }
        }
      ]
    });

    const graphqlResponse = await liveStateGraphql.handle(
      new Request("http://localhost/api/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query: `
            query LiveRoom($id: ID!) {
              liveRoom(id: $id) {
                id
                room {
                  name
                  gameStatus
                  scores {
                    red
                    blue
                  }
                }
                players(where: { desynced: { equals: false }, name: { equals: "Gabriel" } }) {
                  edges {
                    node {
                      name
                      team
                      desynced
                      sessionKind
                      playable
                    }
                  }
                }
                stateFacts(where: { key: { startsWith: "registered" } }) {
                  key
                  type
                  numberValue
                }
              }
            }
          `,
          variables: { id: roomId }
        })
      }),
      {}
    );

    expect(await graphqlResponse.json()).toEqual({
      data: {
        liveRoom: {
          id: roomId,
          room: {
            name: "Live test",
            gameStatus: "RUNNING",
            scores: {
              red: 7,
              blue: 3
            }
          },
          players: {
            edges: [
              {
                node: {
                  name: "Gabriel",
                  team: "RED",
                  desynced: false,
                  sessionKind: "SIGNED_IN",
                  playable: true
                }
              }
            ]
          },
          stateFacts: [
            {
              key: "registered-players",
              type: "NUMBER",
              numberValue: 12
            }
          ]
        }
      }
    });
  });

  it("persists live room commands and delivers them to connected rooms", async () => {
    const { db } = await import("@/db/client");
    const { roomCommands, roomInstances, roomPrograms, roomProgramVersions } =
      await import("@/features/rooms/db");
    const { connectLiveRoom } =
      await import("@/features/live-state/_shared/domain/registry");
    const { completeLiveRoomCommand } =
      await import("@/features/live-state/complete-live-room-command");
    const { liveStateGraphql } = await import("@/features/live-state/graphql");
    const [program] = await db
      .insert(roomPrograms)
      .values({
        uuid: crypto.randomUUID(),
        name: `command-${crypto.randomUUID().slice(0, 8)}`,
        title: "Command test",
        description: "Command test",
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [],
        integrationMode: "integrated",
        haxballTokenEnvVar: "ROOM_TOKEN"
      })
      .returning();
    const [version] = await db
      .insert(roomProgramVersions)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        version: "v1.0.0",
        artifact: {
          releaseId: "command-test",
          tagName: "v1.0.0",
          assetName: "room-v1.0.0.tgz",
          assetUrl: "https://example.com/room-v1.0.0.tgz",
          publishedAt: "2026-05-15T00:00:00.000Z"
        },
        entrypoint: "dist/server.js",
        installStrategy: "none"
      })
      .returning();
    const [room] = await db
      .insert(roomInstances)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        versionId: version.id,
        state: "running",
        roomLink: null,
        launchConfig: {},
        public: false,
        commIdHash: "command-test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .returning();
    const deliveredMessages: unknown[] = [];

    connectLiveRoom({
      roomId: room.uuid,
      contract: null,
      connection: {
        send: (message) => deliveredMessages.push(message)
      }
    });

    const enqueueResponse = await liveStateGraphql.handle(
      new Request("http://localhost/api/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query: `
            mutation Enqueue($input: EnqueueLiveRoomCommandInput!) {
              enqueueLiveRoomCommand(input: $input) {
                id
                roomId
                name
                payload
                status
                sentAt
              }
            }
          `,
          variables: {
            input: {
              roomId: room.uuid,
              name: "ping",
              payload: { nonce: "abc" }
            }
          }
        })
      }),
      {}
    );
    const enqueueBody = await enqueueResponse.json();
    const command = enqueueBody.data.enqueueLiveRoomCommand;

    expect(command).toMatchObject({
      roomId: room.uuid,
      name: "ping",
      payload: { nonce: "abc" },
      status: "SENT",
      sentAt: expect.any(String)
    });
    expect(deliveredMessages).toEqual([
      {
        type: "api.command",
        command: expect.objectContaining({
          id: command.id,
          roomId: room.uuid,
          name: "ping",
          payload: { nonce: "abc" }
        })
      }
    ]);

    await completeLiveRoomCommand({
      commandId: command.id,
      ok: true,
      result: { pong: true }
    });

    const listResponse = await liveStateGraphql.handle(
      new Request("http://localhost/api/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query: `
            query Commands($roomId: ID!) {
              liveRoomCommands(roomId: $roomId, status: ACKNOWLEDGED) {
                edges {
                  node {
                    id
                    status
                    result
                  }
                }
              }
            }
          `,
          variables: { roomId: room.uuid }
        })
      }),
      {}
    );

    expect(await listResponse.json()).toEqual({
      data: {
        liveRoomCommands: {
          edges: [
            {
              node: {
                id: command.id,
                status: "ACKNOWLEDGED",
                result: { pong: true }
              }
            }
          ]
        }
      }
    });

    const storedCommands = await db.select().from(roomCommands);
    expect(
      storedCommands.some(
        (storedCommand) =>
          storedCommand.uuid === command.id &&
          storedCommand.status === "acknowledged"
      )
    ).toBe(true);
  });

  it("closes stale open rooms only when cleanup is configured", async () => {
    const { db } = await import("@/db/client");
    const { roomInstances, roomPrograms, roomProgramVersions } =
      await import("@/features/rooms/db");
    const { closeStaleOpenRooms } =
      await import("@/features/rooms/reconcile-rooms");

    const [program] = await db
      .insert(roomPrograms)
      .values({
        uuid: crypto.randomUUID(),
        name: `internal-${crypto.randomUUID().slice(0, 8)}`,
        title: "Internal",
        description: "Internal",
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [],
        integrationMode: "external",
        haxballTokenEnvVar: "ROOM_TOKEN"
      })
      .returning();
    const [version] = await db
      .insert(roomProgramVersions)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        version: `internal-${crypto.randomUUID().slice(0, 8)}`,
        artifact: {
          releaseId: "internal",
          tagName: "internal",
          assetName: "room-internal.tgz",
          assetUrl: "https://example.com/room-internal.tgz",
          publishedAt: "2026-05-15T00:00:00.000Z"
        },
        entrypoint: "dist/server.js",
        installStrategy: "none"
      })
      .returning();
    const now = new Date("2026-05-15T12:00:00.000Z");
    const staleCreatedAt = "2026-05-14T10:59:59.000Z";
    const freshCreatedAt = "2026-05-15T11:30:00.000Z";
    const [staleRoom] = await db
      .insert(roomInstances)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        versionId: version.id,
        state: "running",
        roomLink: null,
        launchConfig: {},
        public: false,
        commIdHash: "stale",
        createdAt: staleCreatedAt,
        updatedAt: staleCreatedAt
      })
      .returning();
    const [freshRoom] = await db
      .insert(roomInstances)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        versionId: version.id,
        state: "running",
        roomLink: null,
        launchConfig: {},
        public: false,
        commIdHash: "fresh",
        createdAt: freshCreatedAt,
        updatedAt: freshCreatedAt
      })
      .returning();

    expect(
      await closeStaleOpenRooms({
        staleCloseAfterSeconds: 0,
        now
      })
    ).toBe(0);
    expect(
      await closeStaleOpenRooms({
        staleCloseAfterSeconds: 86400,
        now
      })
    ).toBe(1);

    const [closedStaleRoom] = await db
      .select()
      .from(roomInstances)
      .where(eq(roomInstances.id, staleRoom.id));
    const [openFreshRoom] = await db
      .select()
      .from(roomInstances)
      .where(eq(roomInstances.id, freshRoom.id));

    expect(closedStaleRoom).toMatchObject({
      state: "closed",
      closedAt: now.toISOString()
    });
    expect(openFreshRoom).toMatchObject({
      state: "running",
      closedAt: null
    });
  });

  it("clears stale failure metadata when an integrated room reports ready", async () => {
    const { db } = await import("@/db/client");
    const { roomInstances, roomPrograms, roomProgramVersions } =
      await import("@/features/rooms/db");
    const { reportRoomReady } =
      await import("@/features/rooms/report-room-ready");

    const [program] = await db
      .insert(roomPrograms)
      .values({
        uuid: crypto.randomUUID(),
        name: `ready-${crypto.randomUUID().slice(0, 8)}`,
        title: "Ready",
        description: "Ready",
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [],
        integrationMode: "integrated",
        haxballTokenEnvVar: "ROOM_TOKEN"
      })
      .returning();
    const [version] = await db
      .insert(roomProgramVersions)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        version: `ready-${crypto.randomUUID().slice(0, 8)}`,
        artifact: {
          releaseId: "ready",
          tagName: "ready",
          assetName: "room-ready.tgz",
          assetUrl: "https://example.com/room-ready.tgz",
          publishedAt: "2026-05-15T00:00:00.000Z"
        },
        entrypoint: "dist/server.js",
        installStrategy: "none"
      })
      .returning();
    const commId = crypto.randomUUID() + crypto.randomUUID();
    const staleFailureAt = "2026-05-15T12:00:00.000Z";
    const [room] = await db
      .insert(roomInstances)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        versionId: version.id,
        state: "provisioning",
        roomLink: null,
        launchConfig: {},
        public: false,
        commIdHash: await hashSecret(commId),
        failedAt: staleFailureAt,
        failureReason: "Room process exited before readiness",
        updatedAt: staleFailureAt
      })
      .returning();

    const readyRoom = await reportRoomReady(room.uuid, {
      commId,
      roomLink: "https://www.haxball.com/play?c=ready123"
    });
    const [storedRoom] = await db
      .select()
      .from(roomInstances)
      .where(eq(roomInstances.id, room.id));

    expect(readyRoom).toMatchObject({
      state: "running",
      roomLink: "https://www.haxball.com/play?c=ready123",
      failedAt: null,
      failureReason: null
    });
    expect(storedRoom).toMatchObject({
      state: "running",
      roomLink: "https://www.haxball.com/play?c=ready123",
      failedAt: null,
      failureReason: null
    });
  });

  it("marks provisioning rooms failed after readiness timeout", async () => {
    const { db } = await import("@/db/client");
    const { roomInstances, roomPrograms, roomProgramVersions } =
      await import("@/features/rooms/db");
    const { reconcileOpenRooms } =
      await import("@/features/rooms/reconcile-rooms");

    const [program] = await db
      .insert(roomPrograms)
      .values({
        uuid: crypto.randomUUID(),
        name: `timeout-${crypto.randomUUID().slice(0, 8)}`,
        title: "Timeout",
        description: "Timeout",
        releaseSource: {
          owner: "haxbrasil",
          repo: "test-room",
          assetPattern: "room-{tag}.tgz"
        },
        launchConfigFields: [],
        integrationMode: "integrated",
        haxballTokenEnvVar: "ROOM_TOKEN"
      })
      .returning();
    const [version] = await db
      .insert(roomProgramVersions)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        version: `timeout-${crypto.randomUUID().slice(0, 8)}`,
        artifact: {
          releaseId: "timeout",
          tagName: "timeout",
          assetName: "room-timeout.tgz",
          assetUrl: "https://example.com/room-timeout.tgz",
          publishedAt: "2026-05-15T00:00:00.000Z"
        },
        entrypoint: "dist/server.js",
        installStrategy: "none"
      })
      .returning();
    const createdAt = new Date(Date.now() - 121_000).toISOString();
    const [room] = await db
      .insert(roomInstances)
      .values({
        uuid: crypto.randomUUID(),
        programId: program.id,
        versionId: version.id,
        state: "provisioning",
        roomLink: null,
        launchConfig: {},
        public: false,
        commIdHash: "timeout",
        createdAt,
        updatedAt: createdAt
      })
      .returning();

    await reconcileOpenRooms();

    const [failedRoom] = await db
      .select()
      .from(roomInstances)
      .where(eq(roomInstances.id, room.id));

    expect(failedRoom).toMatchObject({
      state: "failed",
      failedAt: expect.any(String),
      failureReason: "Room did not become ready before provisioning timeout"
    });
  });
});

async function hashSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
