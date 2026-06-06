import type {
  MatchFieldTeam,
  MatchTeam
} from "@/features/matches/_shared/http/inputs";
import { MATCH_ROOM_EVENT } from "@/features/match-events/_shared/domain/native-room-events";

export type MatchStintEvent = {
  domain: "room" | "game" | "agent" | "system";
  type: string;
  disabledAt: string | null;
  actorPlayer: {
    id: number;
  } | null;
  team: MatchTeam | null;
  roomPlayerId: number | null;
  occurredAt: string | null;
  elapsedSeconds: number | null;
};

export type DerivedMatchStint = {
  playerId: number;
  team: MatchFieldTeam;
  roomPlayerId: number | null;
  joinedAt: string | null;
  leftAt: string | null;
  joinedElapsedSeconds: number | null;
  leftElapsedSeconds: number | null;
};

type ActiveStint = {
  playerId: number;
  team: MatchFieldTeam;
  roomPlayerId: number | null;
  joinedAt: string | null;
  joinedElapsedSeconds: number | null;
};

type StintDerivationState = {
  activeStints: Map<string, ActiveStint>;
  closedStints: DerivedMatchStint[];
};

export function deriveMatchStints(
  events: MatchStintEvent[]
): DerivedMatchStint[] {
  const roomEvents = events.filter(
    (event) => event.domain === "room" && event.disabledAt === null
  );
  const initialState: StintDerivationState = {
    activeStints: new Map(),
    closedStints: []
  };

  const finalState = roomEvents.reduce(applyStintEvent, initialState);

  const remainingOpenStints = Array.from(finalState.activeStints.values()).map(
    openStint
  );

  return [...finalState.closedStints, ...remainingOpenStints];
}

function applyStintEvent(
  state: StintDerivationState,
  event: MatchStintEvent
): StintDerivationState {
  if (!event.actorPlayer) {
    return state;
  }

  const eventClosesAllMatchingStints =
    event.type === MATCH_ROOM_EVENT.PlayerLeave;

  return eventClosesAllMatchingStints
    ? closeMatchingStints(state, event)
    : applyFieldTeamEvent(state, event);
}

function closeMatchingStints(
  state: StintDerivationState,
  event: MatchStintEvent
): StintDerivationState {
  if (!event.actorPlayer) {
    return state;
  }

  const playerId = event.actorPlayer.id;
  const roomPlayerId = event.roomPlayerId;

  const activeEntries = Array.from(state.activeStints.entries());

  const matchingEntries = activeEntries.filter(([, activeStint]) =>
    matchesPlayer(activeStint, playerId, roomPlayerId)
  );

  const matchingKeys = matchingEntries.map(([activeKey]) => activeKey);

  const closedStints = matchingEntries.map(([, activeStint]) =>
    closeStint(activeStint, event)
  );

  const activeStints = new Map(state.activeStints);

  matchingKeys.map((activeKey) => activeStints.delete(activeKey));

  return {
    activeStints,
    closedStints: [...state.closedStints, ...closedStints]
  };
}

function applyFieldTeamEvent(
  state: StintDerivationState,
  event: MatchStintEvent
): StintDerivationState {
  if (!event.actorPlayer) {
    return state;
  }

  const activeKey = activeStintKey(event.actorPlayer.id, event.roomPlayerId);
  const existingStint = state.activeStints.get(activeKey);

  const closedExistingStints = existingStint
    ? [closeStint(existingStint, event)]
    : [];

  const nextStint = toActiveFieldStint(event);

  const activeStints = new Map(state.activeStints);

  activeStints.delete(activeKey);

  if (nextStint) {
    activeStints.set(activeKey, nextStint);
  }

  return {
    activeStints,
    closedStints: [...state.closedStints, ...closedExistingStints]
  };
}

function toActiveFieldStint(event: MatchStintEvent): ActiveStint | null {
  if (!event.actorPlayer) {
    return null;
  }

  const team = event.team;
  const isFieldTeam = team === "red" || team === "blue";

  if (!isFieldTeam) {
    return null;
  }

  return {
    playerId: event.actorPlayer.id,
    team,
    roomPlayerId: event.roomPlayerId,
    joinedAt: event.occurredAt,
    joinedElapsedSeconds: event.elapsedSeconds
  };
}

function openStint(stint: ActiveStint): DerivedMatchStint {
  return {
    ...stint,
    leftAt: null,
    leftElapsedSeconds: null
  };
}

function activeStintKey(playerId: number, roomPlayerId: number | null): string {
  return `${playerId}:${roomPlayerId ?? ""}`;
}

function matchesPlayer(
  stint: ActiveStint,
  playerId: number,
  roomPlayerId: number | null
): boolean {
  if (stint.playerId !== playerId) {
    return false;
  }

  return roomPlayerId === null || stint.roomPlayerId === roomPlayerId;
}

function closeStint(
  stint: ActiveStint,
  event: MatchStintEvent
): DerivedMatchStint {
  return {
    ...stint,
    leftAt: event.occurredAt,
    leftElapsedSeconds: event.elapsedSeconds
  };
}
