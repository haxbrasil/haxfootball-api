import { enqueueLiveRoomCommand } from "@/features/live-state/enqueue-live-room-command";
import { listLiveRoomCommands } from "@/features/live-state/list-live-room-commands";
import {
  getLiveRoom,
  listLiveRooms
} from "@/features/live-state/_shared/domain/registry";
import {
  connection,
  matchesLiveRoom,
  matchesPlayer,
  matchesStateDocument,
  matchesStateFact
} from "@/features/live-state/_graphql/filters";
import {
  LiveRoomCommandStatus,
  type Resolvers
} from "@/features/live-state/_graphql/generated";
import {
  dateTimeScalar,
  jsonScalar
} from "@/features/live-state/_graphql/scalars";

const enumResolvers = {
  LiveGameStatus: {
    STOPPED: "stopped",
    RUNNING: "running",
    PAUSED: "paused",
    RESUMING: "resuming"
  },
  LiveTeam: {
    SPECTATORS: "spectators",
    RED: "red",
    BLUE: "blue"
  },
  LivePlayerSessionKind: {
    GUEST: "guest",
    RESOLVING: "resolving",
    SIGNING_IN: "signing-in",
    SIGNED_IN: "signed-in"
  },
  LiveStateFactType: {
    STRING: "string",
    NUMBER: "number",
    BOOLEAN: "boolean"
  },
  LiveRoomCommandStatus: {
    QUEUED: "queued",
    SENT: "sent",
    ACKNOWLEDGED: "acknowledged",
    FAILED: "failed"
  }
};

const typedResolvers: Resolvers = {
  DateTime: dateTimeScalar,
  JSON: jsonScalar,
  Query: {
    liveRooms: (_parent, args) =>
      connection(
        listLiveRooms().filter((room) => matchesLiveRoom(room, args.where)),
        args
      ),
    liveRoom: (_parent, args) => getLiveRoom(args.id),
    liveRoomCommands: (_parent, args) =>
      listLiveRoomCommands({
        roomId: args.roomId,
        status: toRoomCommandStatus(args.status),
        first: args.first,
        after: args.after
      })
  },
  Mutation: {
    enqueueLiveRoomCommand: (_parent, args) =>
      enqueueLiveRoomCommand(args.input)
  },
  LiveRoom: {
    players: (room, args) =>
      connection(
        room.players.filter((player) => matchesPlayer(player, args.where)),
        args
      ),
    stateDocuments: (room, args) =>
      room.stateDocuments.filter((document) =>
        matchesStateDocument(document, args.where)
      ),
    stateFacts: (room, args) =>
      room.stateFacts.filter((fact) => matchesStateFact(fact, args.where))
  }
};

export const resolvers = {
  ...enumResolvers,
  ...typedResolvers
};

function toRoomCommandStatus(status: LiveRoomCommandStatus | null | undefined) {
  switch (status) {
    case LiveRoomCommandStatus.Queued:
      return "queued";
    case LiveRoomCommandStatus.Sent:
      return "sent";
    case LiveRoomCommandStatus.Acknowledged:
      return "acknowledged";
    case LiveRoomCommandStatus.Failed:
      return "failed";
    default:
      return null;
  }
}
