import type { MatchEventInput } from "@/features/match-events/_shared/http/inputs";
import { badRequest } from "@/shared/http/errors";

export const nativeRoomEventTypes = [
  "player-joined",
  "player-left",
  "player-team-changed"
] as const;

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

  if (input.type === "player-left" && input.team !== undefined) {
    throw badRequest("Player leave events cannot include a team");
  }

  if (
    (input.type === "player-joined" || input.type === "player-team-changed") &&
    input.team === undefined
  ) {
    throw badRequest("Player join and team change events must include a team");
  }
}
