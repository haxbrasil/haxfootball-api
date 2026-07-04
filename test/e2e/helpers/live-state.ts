import type { LiveRoomSnapshot } from "@/features/live-state/_shared/domain/protocol";
import type {
  RoomInstanceState,
  RoomProgramLiveStateContract
} from "@/features/rooms/db";
import { setupTestDatabase } from "@/test/e2e/helpers/helpers";
import type { JsonValue } from "@lib";

export type {
  LivePlayer,
  LiveRoomSnapshot
} from "@/features/live-state/_shared/domain/protocol";
export type { RoomProgramLiveStateContract } from "@/features/rooms/db";

export type LiveRoomFixture = {
  commId: string;
  roomId: string;
};

export async function createLiveRoomFixture(input?: {
  liveStateContract?: RoomProgramLiveStateContract | null;
  state?: RoomInstanceState;
}): Promise<LiveRoomFixture> {
  await setupTestDatabase();

  const commId = crypto.randomUUID();
  const { db } = await import("@/db/client");
  const { roomInstances, roomPrograms, roomProgramVersions } =
    await import("@/features/rooms/db");
  const [program] = await db
    .insert(roomPrograms)
    .values({
      uuid: crypto.randomUUID(),
      name: `live-state-e2e-${crypto.randomUUID().slice(0, 8)}`,
      title: "Live state E2E",
      description: "Live state E2E",
      releaseSource: {
        owner: "haxbrasil",
        repo: "test-room",
        assetPattern: "room-{tag}.tgz"
      },
      launchConfigFields: [],
      liveStateContract: input?.liveStateContract ?? null,
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
        releaseId: "live-state-e2e",
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
      state: input?.state ?? "running",
      roomLink: null,
      launchConfig: {},
      public: false,
      commIdHash: await hashSecret(commId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    .returning();

  return {
    commId,
    roomId: room.uuid
  };
}

export async function connectLiveRoomFixture(input: {
  roomId: string;
  deliveredMessages?: unknown[];
}): Promise<void> {
  const { deliverQueuedRoomCommands } =
    await import("@/features/live-state/_shared/db/commands");
  const { getRoomRow } = await import("@/features/rooms/_shared/db/queries");
  const { connectLiveRoom } =
    await import("@/features/live-state/_shared/domain/registry");
  const { program } = await getRoomRow(input.roomId);

  connectLiveRoom({
    roomId: input.roomId,
    contract: program.liveStateContract,
    connection: {
      send: (message) => input.deliveredMessages?.push(message)
    }
  });
  await deliverQueuedRoomCommands(input.roomId);
}

export async function publishLiveRoomSnapshot(
  roomId: string,
  snapshot: LiveRoomSnapshot
): Promise<void> {
  const { replaceLiveRoomSnapshot } =
    await import("@/features/live-state/_shared/domain/registry");

  replaceLiveRoomSnapshot(roomId, snapshot);
}

export async function acknowledgeLiveRoomCommand(input: {
  commandId: string;
  ok?: boolean;
  result: JsonValue;
  error?: string | null;
}): Promise<void> {
  const { completeLiveRoomCommand } =
    await import("@/features/live-state/complete-live-room-command");

  await completeLiveRoomCommand({
    commandId: input.commandId,
    ok: input.ok ?? true,
    result: input.result,
    error: input.error
  });
}

export async function disconnectLiveRoomFixture(roomId: string): Promise<void> {
  const { disconnectLiveRoom } =
    await import("@/features/live-state/_shared/domain/registry");

  disconnectLiveRoom(roomId);
}

async function hashSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
