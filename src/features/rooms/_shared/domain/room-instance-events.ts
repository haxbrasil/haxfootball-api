export const ROOM_INSTANCE_EVENT = {
  PlayerJoined: "player-joined",
  PlayerLeave: "player-leave",
  PlayerTeamChange: "player-team-change"
} as const;

export type RoomInstanceEventType =
  (typeof ROOM_INSTANCE_EVENT)[keyof typeof ROOM_INSTANCE_EVENT];
