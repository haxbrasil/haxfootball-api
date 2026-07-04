import { and, eq, inArray } from "drizzle-orm";
import { decodeCursor, encodeCursor, isJsonValue, type JsonValue } from "@lib";
import { db } from "@/db/client";
import {
  roomCommands,
  roomInstances,
  type RoomCommand
} from "@/features/rooms/db";
import { getRoomRow } from "@/features/rooms/_shared/db/queries";
import { sendLiveRoomMessage } from "@/features/live-state/_shared/domain/registry";
import { badRequest, notFound } from "@/shared/http/errors";

export type EnqueueLiveRoomCommandInput = {
  roomId: string;
  name: string;
  payload?: JsonValue | null;
};

export type ListLiveRoomCommandsInput = {
  roomId: string;
  status?: RoomCommand["status"] | null;
  first?: number | null;
  after?: string | null;
};

export type CompleteLiveRoomCommandInput = {
  commandId: string;
  roomId?: string;
  ok: boolean;
  result?: JsonValue | null;
  error?: string | null;
};

const commandNamePattern = /^[a-z][a-z0-9.-]{0,127}$/;

export type LiveRoomCommandResponse = {
  id: string;
  roomId: string;
  name: string;
  payload: JsonValue | null;
  status: RoomCommand["status"];
  result: JsonValue | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
};

export async function enqueueLiveRoomCommand(
  input: EnqueueLiveRoomCommandInput
): Promise<LiveRoomCommandResponse> {
  if (!commandNamePattern.test(input.name)) {
    throw badRequest("Live room command name is invalid");
  }

  const { room } = await getRoomRow(input.roomId);
  const payload = input.payload ?? null;

  if (room.state !== "provisioning" && room.state !== "running") {
    throw badRequest("Live room commands are not available for terminal rooms");
  }

  if (!isJsonValue(payload)) {
    throw badRequest("Live room command payload must be JSON");
  }

  const [command] = await db
    .insert(roomCommands)
    .values({
      uuid: crypto.randomUUID(),
      roomId: room.id,
      name: input.name,
      payload
    })
    .returning();

  const deliveredCommand = await deliverRoomCommand(command, room.uuid);

  return toLiveRoomCommandResponse(deliveredCommand, room.uuid);
}

export async function deliverQueuedRoomCommands(
  roomUuid: string
): Promise<void> {
  const { room } = await getRoomRow(roomUuid);
  const commands = await db
    .select()
    .from(roomCommands)
    .where(
      and(
        eq(roomCommands.roomId, room.id),
        inArray(roomCommands.status, ["queued", "sent"])
      )
    );

  for (const command of commands) {
    await deliverRoomCommand(command, room.uuid);
  }
}

export async function completeLiveRoomCommand(
  input: CompleteLiveRoomCommandInput
): Promise<LiveRoomCommandResponse> {
  if (input.result !== undefined && !isJsonValue(input.result)) {
    throw badRequest("Live room command result must be JSON");
  }

  const [existingCommand] = await db
    .select()
    .from(roomCommands)
    .where(eq(roomCommands.uuid, input.commandId));

  if (!existingCommand) {
    throw notFound("Live room command not found");
  }

  const [room] = await db
    .select()
    .from(roomInstances)
    .where(eq(roomInstances.id, existingCommand.roomId));

  if (!room) {
    throw notFound("Room not found");
  }

  if (input.roomId && room.uuid !== input.roomId) {
    throw badRequest("Live room command does not belong to this room");
  }

  if (existingCommand.status !== "sent") {
    throw badRequest("Live room command is not awaiting completion");
  }

  const now = new Date().toISOString();
  const [command] = await db
    .update(roomCommands)
    .set({
      status: input.ok ? "acknowledged" : "failed",
      result: input.ok ? (input.result ?? null) : null,
      error: input.ok ? null : (input.error ?? "Command failed"),
      completedAt: now,
      updatedAt: now
    })
    .where(eq(roomCommands.id, existingCommand.id))
    .returning();

  return toLiveRoomCommandResponse(command, room.uuid);
}

export async function listLiveRoomCommands(input: ListLiveRoomCommandsInput) {
  const { room } = await getRoomRow(input.roomId);
  const first = Math.min(Math.max(input.first ?? 50, 1), 100);
  const after = decodeCursor<number>(input.after ?? undefined);
  const start = typeof after === "number" ? after + 1 : 0;
  const commands = await db
    .select()
    .from(roomCommands)
    .where(
      input.status
        ? and(
            eq(roomCommands.roomId, room.id),
            eq(roomCommands.status, input.status)
          )
        : eq(roomCommands.roomId, room.id)
    );
  const items = commands.slice(start, start + first);
  const hasNextPage = start + first < commands.length;
  const endIndex = items.length > 0 ? start + items.length - 1 : null;

  return {
    edges: items.map((command, index) => ({
      cursor: encodeCursor(start + index),
      node: toLiveRoomCommandResponse(command, room.uuid)
    })),
    nodes: items.map((command) =>
      toLiveRoomCommandResponse(command, room.uuid)
    ),
    pageInfo: {
      hasNextPage,
      endCursor: endIndex === null ? null : encodeCursor(endIndex)
    }
  };
}

async function deliverRoomCommand(
  command: RoomCommand,
  knownRoomUuid?: string
): Promise<RoomCommand> {
  const roomUuid =
    knownRoomUuid ??
    (
      await db
        .select({ uuid: roomInstances.uuid })
        .from(roomInstances)
        .where(eq(roomInstances.id, command.roomId))
    )[0]?.uuid;

  if (!roomUuid) {
    return command;
  }

  const delivered = sendLiveRoomMessage(roomUuid, {
    type: "api.command",
    command: toLiveRoomCommandResponse(command, roomUuid)
  });

  if (!delivered) {
    return command;
  }

  const now = new Date().toISOString();
  const [updatedCommand] = await db
    .update(roomCommands)
    .set({
      status: "sent",
      sentAt: now,
      updatedAt: now
    })
    .where(eq(roomCommands.id, command.id))
    .returning();

  return updatedCommand ?? command;
}

function toLiveRoomCommandResponse(
  command: RoomCommand,
  roomUuid: string
): LiveRoomCommandResponse {
  return {
    id: command.uuid,
    roomId: roomUuid,
    name: command.name,
    payload: command.payload ?? null,
    status: command.status,
    result: command.result ?? null,
    error: command.error,
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
    sentAt: command.sentAt,
    completedAt: command.completedAt
  };
}
