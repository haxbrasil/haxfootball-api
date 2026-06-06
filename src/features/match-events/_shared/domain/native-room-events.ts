import type { MatchEventInput } from "@/features/match-events/_shared/http/inputs";
import { badRequest } from "@/shared/http/errors";

export const MATCH_ROOM_EVENT = {
  PlayerTeamChange: "player-team-change",
  PlayerLeave: "player-leave"
} as const;

export const nativeRoomEventTypes = Object.values(MATCH_ROOM_EVENT);

export type NativeRoomEventType = (typeof nativeRoomEventTypes)[number];

export function isNativeRoomEventType(
  type: string
): type is NativeRoomEventType {
  return nativeRoomEventTypes.includes(type as NativeRoomEventType);
}

export function validateNativeRoomEvent(input: MatchEventInput): void {
  if (input.domain !== "room") {
    return;
  }

  if (!isNativeRoomEventType(input.type)) {
    throw badRequest("Unknown room event type");
  }

  if (input.type === MATCH_ROOM_EVENT.PlayerLeave && input.team !== undefined) {
    throw badRequest("Player leave events cannot include a team");
  }

  if (
    input.type === MATCH_ROOM_EVENT.PlayerTeamChange &&
    input.team === undefined
  ) {
    throw badRequest("Player team change events must include a team");
  }
}
