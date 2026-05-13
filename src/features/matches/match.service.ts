import type {
  MatchPlayerEventInput,
  MatchScore,
  MatchStatus
} from "@/features/matches/match.contract";
import type { Match } from "@/features/matches/match.db";
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

export function validateMatchEvents(events: MatchPlayerEventInput[]): void {
  const eventWithInvalidLeaveTeam = events.find(hasInvalidLeaveTeam);

  if (eventWithInvalidLeaveTeam) {
    throw badRequest("Player leave events cannot include a team");
  }

  const eventWithMissingTeam = events.find(hasMissingJoinOrTeamChangeTeam);

  if (eventWithMissingTeam) {
    throw badRequest("Player join and team change events must include a team");
  }

  const eventWithPartialTime = events.find(hasPartialTime);

  if (eventWithPartialTime) {
    throw badRequest(
      "Player event occurredAt and elapsedSeconds must be provided together"
    );
  }
}

function hasInvalidLeaveTeam(event: MatchPlayerEventInput): boolean {
  const isLeaveEvent = event.type === "player_leave";
  const hasTeam = event.team !== undefined;

  return isLeaveEvent && hasTeam;
}

function hasMissingJoinOrTeamChangeTeam(event: MatchPlayerEventInput): boolean {
  const isLeaveEvent = event.type === "player_leave";
  const requiresTeam = !isLeaveEvent;
  const hasTeam = !!event.team;

  return requiresTeam && !hasTeam;
}

function hasPartialTime(event: MatchPlayerEventInput): boolean {
  const hasOccurredAt = event.occurredAt !== undefined;
  const hasElapsedSeconds = event.elapsedSeconds !== undefined;

  return hasOccurredAt !== hasElapsedSeconds;
}
