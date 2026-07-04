import { Elysia, t } from "elysia";
import { applyLiveRoomSnapshot } from "@/features/live-state/apply-live-room-snapshot";
import { completeLiveRoomCommand } from "@/features/live-state/complete-live-room-command";
import { connectLiveRoomControl } from "@/features/live-state/connect-live-room-control";
import { disconnectLiveRoom } from "@/features/live-state/_shared/domain/registry";
import type {
  ApiPongMessage,
  RoomControlMessage
} from "@/features/live-state/_shared/domain/protocol";
import { liveStateGraphql } from "@/features/live-state/graphql";
import { roomIdParamsSchema } from "@/features/rooms/_shared/http/inputs";

type ControlSocket = {
  id: string;
  data: {
    params: {
      id: string;
    };
  };
  send(message: unknown): void;
};

type ControlMessageContext = {
  active: boolean;
  roomId: string | null;
  socket: ControlSocket;
};

type ControlMessageHandler<TMessage extends RoomControlMessage> = (
  context: ControlMessageContext,
  message: TMessage
) => Promise<void> | void;

const socketRoomIds = new Map<string, string>();
const activeSocketIdsByRoom = new Map<string, string>();

const controlMessageHandlers = {
  "room.ping": async (context, message) => {
    try {
      const roomId = context.socket.data.params.id;
      await connectLiveRoomControl({
        roomId,
        commId: message.commId,
        connection: {
          send: (outgoing) => context.socket.send(outgoing)
        }
      });
      socketRoomIds.set(context.socket.id, roomId);
      activeSocketIdsByRoom.set(roomId, context.socket.id);
      context.socket.send(pong(true, true));
    } catch (error) {
      context.socket.send(
        pong(
          false,
          true,
          error instanceof Error ? error.message : "Room ping was rejected"
        )
      );
    }
  },
  "room.snapshot": (context, message) => {
    const roomId = requireConnectedRoom(
      context,
      "Room ping is required before snapshots"
    );

    if (!roomId) {
      return;
    }

    try {
      applyLiveRoomSnapshot({
        roomId,
        snapshot: message.snapshot
      });
    } catch (error) {
      context.socket.send(
        pong(
          false,
          true,
          error instanceof Error ? error.message : "Invalid snapshot"
        )
      );
    }
  },
  "room.command-result": async (context, message) => {
    const roomId = requireConnectedRoom(
      context,
      "Room ping is required before command results"
    );

    if (!roomId) {
      return;
    }

    try {
      await completeLiveRoomCommand({
        ...message,
        roomId
      });
    } catch (error) {
      context.socket.send(
        pong(
          false,
          false,
          error instanceof Error ? error.message : "Invalid command result"
        )
      );
    }
  }
} satisfies {
  [TType in RoomControlMessage["type"]]: ControlMessageHandler<
    Extract<RoomControlMessage, { type: TType }>
  >;
};

export const liveStateRoutes = new Elysia()
  .all("/graphql", ({ request }) => liveStateGraphql.handle(request, {}))
  .ws("/rooms/:id/control", {
    params: roomIdParamsSchema,
    body: t.Any(),
    async message(ws, rawMessage) {
      const message = parseControlMessage(rawMessage);

      if (!message) {
        ws.send(pong(false, true, "Invalid live state message"));
        return;
      }

      await dispatchControlMessage(ws, message);
    },
    close(ws) {
      const roomId = socketRoomIds.get(ws.id);

      if (roomId && activeSocketIdsByRoom.get(roomId) === ws.id) {
        disconnectLiveRoom(roomId);
        activeSocketIdsByRoom.delete(roomId);
      }

      socketRoomIds.delete(ws.id);
    }
  });

async function dispatchControlMessage(
  socket: ControlSocket,
  message: RoomControlMessage
): Promise<void> {
  const handler = controlMessageHandlers[message.type] as ControlMessageHandler<
    typeof message
  >;
  const roomId = socketRoomIds.get(socket.id) ?? null;

  await handler(
    {
      active:
        roomId !== null && activeSocketIdsByRoom.get(roomId) === socket.id,
      roomId: socketRoomIds.get(socket.id) ?? null,
      socket
    },
    message
  );
}

function requireConnectedRoom(
  context: ControlMessageContext,
  errorMessage: string
): string | null {
  if (context.roomId) {
    if (!context.active) {
      context.socket.send(
        pong(false, false, "Room control connection is not active")
      );
      return null;
    }

    return context.roomId;
  }

  context.socket.send(pong(false, true, errorMessage));
  return null;
}

function pong(
  accepted: boolean,
  requiresSnapshot: boolean,
  error?: string
): ApiPongMessage {
  return {
    type: "api.pong",
    accepted,
    requiresSnapshot,
    serverTime: new Date().toISOString(),
    ...(error ? { error } : {})
  };
}

function parseControlMessage(rawMessage: unknown): RoomControlMessage | null {
  if (typeof rawMessage === "string") {
    try {
      return JSON.parse(rawMessage) as RoomControlMessage;
    } catch {
      return null;
    }
  }

  if (rawMessage && typeof rawMessage === "object") {
    return rawMessage as RoomControlMessage;
  }

  return null;
}
