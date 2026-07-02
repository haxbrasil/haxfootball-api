import { toJsonValueSchema, validateJsonValue } from "@lib";
import { readJsonPointer } from "@/features/rooms/_shared/domain/live-state-contract";
import type { RoomProgramLiveStateContract } from "@/features/rooms/db";
import type {
  LiveRoomSnapshot,
  LiveRoomState,
  LiveStateDocument,
  LiveStateFact
} from "@/features/live-state/_shared/domain/protocol";

type RoomConnection = {
  send(message: unknown): void;
};

type RegistryEntry = {
  roomId: string;
  contract: RoomProgramLiveStateContract | null;
  connection: RoomConnection | null;
  state: LiveRoomState | null;
  lastSeenAt: string;
};

const rooms = new Map<string, RegistryEntry>();

export function connectLiveRoom(input: {
  roomId: string;
  contract: RoomProgramLiveStateContract | null;
  connection: RoomConnection;
}): void {
  const now = new Date().toISOString();
  const existing = rooms.get(input.roomId);

  rooms.set(input.roomId, {
    roomId: input.roomId,
    contract: input.contract,
    connection: input.connection,
    state: existing?.state
      ? { ...existing.state, connected: true, lastSeenAt: now }
      : null,
    lastSeenAt: now
  });
}

export function disconnectLiveRoom(roomId: string): void {
  const existing = rooms.get(roomId);

  if (!existing) {
    return;
  }

  const now = new Date().toISOString();

  rooms.set(roomId, {
    ...existing,
    connection: null,
    state: existing.state
      ? { ...existing.state, connected: false, lastSeenAt: now }
      : null,
    lastSeenAt: now
  });
}

export function replaceLiveRoomSnapshot(
  roomId: string,
  snapshot: LiveRoomSnapshot
): LiveRoomState {
  const existing = rooms.get(roomId);

  if (!existing) {
    throw new Error("Live room is not connected");
  }

  const now = new Date().toISOString();
  const stateDocuments = buildStateDocuments({
    contract: existing.contract,
    documents: snapshot.stateDocuments ?? [],
    revision: snapshot.revision,
    updatedAt: now
  });
  const stateFacts = buildStateFacts(existing.contract, stateDocuments);
  const state: LiveRoomState = {
    id: roomId,
    connected: true,
    revision: snapshot.revision,
    lastSeenAt: now,
    room: snapshot.room,
    players: snapshot.players,
    stateDocuments,
    stateFacts
  };

  rooms.set(roomId, {
    ...existing,
    state,
    lastSeenAt: now
  });

  return state;
}

export function getLiveRoom(roomId: string): LiveRoomState | null {
  return rooms.get(roomId)?.state ?? null;
}

export function listLiveRooms(): LiveRoomState[] {
  return Array.from(rooms.values())
    .map((entry) => entry.state)
    .filter((state): state is LiveRoomState => !!state);
}

export function sendLiveRoomMessage(roomId: string, message: unknown): boolean {
  const connection = rooms.get(roomId)?.connection;

  if (!connection) {
    return false;
  }

  connection.send(message);
  return true;
}

function buildStateDocuments(input: {
  contract: RoomProgramLiveStateContract | null;
  documents: LiveRoomSnapshot["stateDocuments"];
  revision: number;
  updatedAt: string;
}): LiveStateDocument[] {
  if (!input.documents || input.documents.length === 0) {
    return [];
  }

  if (!input.contract) {
    throw new Error("Room published state documents without a contract");
  }

  const contractByName = new Map(
    input.contract.documents.map((document) => [document.name, document])
  );

  const contract = input.contract;

  return input.documents.map((document) => {
    const contractDocument = contractByName.get(document.name);

    if (!contractDocument) {
      throw new Error(`Unknown live state document '${document.name}'`);
    }

    if (document.version !== contractDocument.version) {
      throw new Error(`Invalid live state document version '${document.name}'`);
    }

    const schema = toJsonValueSchema(contractDocument.schema);

    if (!validateJsonValue(document.payload, schema ?? undefined)) {
      throw new Error(`Invalid live state document payload '${document.name}'`);
    }

    return {
      namespace: contract.namespace,
      name: document.name,
      version: document.version,
      payload: document.payload,
      revision: input.revision,
      updatedAt: input.updatedAt
    };
  });
}

function buildStateFacts(
  contract: RoomProgramLiveStateContract | null,
  documents: LiveStateDocument[]
): LiveStateFact[] {
  if (!contract || documents.length === 0) {
    return [];
  }

  const documentByName = new Map(
    documents.map((document) => [document.name, document])
  );

  return contract.facts.flatMap((fact) => {
    const document = documentByName.get(fact.document);

    if (!document) {
      return [];
    }

    const value = readJsonPointer(document.payload, fact.pointer);

    if (fact.type === "string" && typeof value === "string") {
      return {
        namespace: contract.namespace,
        key: fact.key,
        type: fact.type,
        stringValue: value,
        numberValue: null,
        booleanValue: null
      };
    }

    if (fact.type === "number" && typeof value === "number") {
      return {
        namespace: contract.namespace,
        key: fact.key,
        type: fact.type,
        stringValue: null,
        numberValue: value,
        booleanValue: null
      };
    }

    if (fact.type === "boolean" && typeof value === "boolean") {
      return {
        namespace: contract.namespace,
        key: fact.key,
        type: fact.type,
        stringValue: null,
        numberValue: null,
        booleanValue: value
      };
    }

    return [];
  });
}
