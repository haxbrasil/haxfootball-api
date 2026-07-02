import type { JsonValue } from "@lib";

export type LiveTeam = "spectators" | "red" | "blue";
export type LivePlayerSessionKind =
  | "guest"
  | "resolving"
  | "signing-in"
  | "signed-in";
export type LiveGameStatus = "stopped" | "running" | "paused" | "resuming";
export type LiveStateFactType = "string" | "number" | "boolean";

export type LiveNativeScore = {
  red: number;
  blue: number;
};

export type LiveNativeRoom = {
  name: string | null;
  teamsLocked: boolean | null;
  gameStatus: LiveGameStatus;
  scores: LiveNativeScore | null;
};

export type LivePlayer = {
  roomPlayerId: number;
  name: string;
  team: LiveTeam;
  admin: boolean;
  avatar: string | null;
  desynced: boolean | null;
  sessionKind: LivePlayerSessionKind | null;
  playable: boolean | null;
  playBlockedReason: string | null;
};

export type LiveStateDocumentSnapshot = {
  name: string;
  version: number;
  payload: JsonValue;
};

export type LiveStateDocument = LiveStateDocumentSnapshot & {
  namespace: string;
  revision: number;
  updatedAt: string;
};

export type LiveStateFact = {
  namespace: string;
  key: string;
  type: LiveStateFactType;
  stringValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
};

export type LiveRoomSnapshot = {
  revision: number;
  room: LiveNativeRoom;
  players: LivePlayer[];
  stateDocuments?: LiveStateDocumentSnapshot[];
};

export type LiveRoomState = {
  id: string;
  connected: boolean;
  revision: number;
  lastSeenAt: string;
  room: LiveNativeRoom;
  players: LivePlayer[];
  stateDocuments: LiveStateDocument[];
  stateFacts: LiveStateFact[];
};

export type RoomPingMessage = {
  type: "room.ping";
  protocolVersion: 1;
  commId: string;
  snapshotRevision?: number | null;
};

export type ApiPongMessage = {
  type: "api.pong";
  accepted: boolean;
  requiresSnapshot: boolean;
  serverTime: string;
  error?: string;
};

export type ApiCommandMessage = {
  type: "api.command";
  command: {
    id: string;
    roomId: string;
    name: string;
    payload: JsonValue | null;
  };
};

export type RoomSnapshotMessage = {
  type: "room.snapshot";
  snapshot: LiveRoomSnapshot;
};

export type RoomCommandResultMessage = {
  type: "room.command-result";
  commandId: string;
  ok: boolean;
  result?: JsonValue | null;
  error?: string | null;
};

export type RoomControlMessage =
  | RoomPingMessage
  | RoomSnapshotMessage
  | RoomCommandResultMessage;
