import type {
  MatchEventInput,
  MatchScore,
  MatchStatus
} from "@/features/matches/_shared/http/inputs";
import { validateNativeRoomEvent } from "@/features/match-events/_shared/domain/native-room-events";
import type { Match } from "@/features/matches/db";
import { badRequest } from "@/shared/http/errors";

export function assertMatchIsEditable(match: Match): void {
  if (match.status === "completed") {
    throw badRequest("Completed matches cannot be edited");
  }
}

export function assertCompletedMatchFields(input: {
  status: MatchStatus;
  endedAt?: string | null;
  score?: MatchScore | null;
}): void {
  if (input.status !== "completed") {
    return;
  }

  if (!input.endedAt) {
    throw badRequest("Completed matches must include an endedAt timestamp");
  }

  if (!input.score) {
    throw badRequest("Completed matches must include a score");
  }
}

export function validateMatchEvents(events: MatchEventInput[]): void {
  const eventWithPartialTime = events.find(hasPartialTime);

  if (eventWithPartialTime) {
    throw badRequest(
      "Player event occurredAt and elapsedSeconds must be provided together"
    );
  }

  const playerScopedEventWithoutPlayer = events.find(
    (event) =>
      event.scope === "player" && !event.actorPlayerId && !event.subjectPlayerId
  );

  if (playerScopedEventWithoutPlayer) {
    throw badRequest(
      "Player-scoped events require actorPlayerId or subjectPlayerId"
    );
  }

  const teamScopedEventWithoutTeam = events.find(
    (event) => event.scope === "team" && !event.team
  );

  if (teamScopedEventWithoutTeam) {
    throw badRequest("Team-scoped events require team");
  }

  for (const event of events) {
    validateNativeRoomEvent(event);
  }
}

function hasPartialTime(event: MatchEventInput): boolean {
  if (event.domain !== "room") {
    return false;
  }

  const hasOccurredAt = event.occurredAt !== undefined;
  const hasElapsedSeconds = event.elapsedSeconds !== undefined;

  return hasOccurredAt !== hasElapsedSeconds;
}
