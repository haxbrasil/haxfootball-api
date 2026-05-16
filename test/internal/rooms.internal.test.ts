import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { setupInternalTestDatabase } from "@/test/internal/helpers/database";

beforeAll(async () => {
  await setupInternalTestDatabase();
});

describe("room internals", () => {
  it("forces public room launch config private only when the policy is enabled", async () => {
    const { buildEffectiveRoomEnvironment, resolveLaunchConfig } = await import(
      "@/features/rooms/room.service"
    );

    const fields = [
      {
        key: "roomPublic",
        displayName: "Public room",
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

  it("closes stale open rooms only when cleanup is configured", async () => {
    const { db } = await import("@/db/client");
    const { roomInstances, roomPrograms, roomProgramVersions } = await import(
      "@/features/rooms/room.db"
    );
    const { closeStaleOpenRooms } = await import(
      "@/features/rooms/reconcile-rooms"
    );

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

  it("marks provisioning rooms failed after readiness timeout", async () => {
    const { db } = await import("@/db/client");
    const { roomInstances, roomPrograms, roomProgramVersions } = await import(
      "@/features/rooms/room.db"
    );
    const { reconcileOpenRooms } = await import(
      "@/features/rooms/reconcile-rooms"
    );

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
