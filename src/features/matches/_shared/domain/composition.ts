import type { MatchRoundInput } from "@/features/matches/_shared/http/inputs";
import type { MatchCompositionScoreMode } from "@/features/matches/_shared/http/inputs";
import type { Match } from "@/features/matches/db";
import { badRequest } from "@/shared/http/errors";

export type MatchRoundReference =
  | {
      kind: "sequential";
      number: number;
      matchId: string;
      orientation: TeamOrientation;
    }
  | {
      kind: "extra-time";
      number: null;
      matchId: string;
      orientation: TeamOrientation;
    };

export type TeamOrientation = "aligned" | "swapped";
export type TeamPlayers = { red: Set<number>; blue: Set<number> };
export type MatchScore = { red: number; blue: number };

export function toMatchRoundReference(
  round: {
    kind: "sequential" | "extra-time";
    roundNumber: number | null;
    teamOrientation: TeamOrientation;
  },
  matchId: string
): MatchRoundReference {
  if (round.kind === "sequential" && round.roundNumber !== null) {
    return {
      kind: "sequential",
      number: round.roundNumber,
      matchId,
      orientation: round.teamOrientation
    };
  }

  if (round.kind === "extra-time" && round.roundNumber === null) {
    return {
      kind: "extra-time",
      number: null,
      matchId,
      orientation: round.teamOrientation
    };
  }

  throw new Error("Persisted match round has an invalid kind and number");
}

export function validateMatchCompositionRounds(
  rounds: MatchRoundInput[],
  matchesByPublicId: Map<string, Match>
): void {
  if (rounds.length < 2) {
    throw badRequest("A composed match must contain at least two matches");
  }

  const sequentialRounds = rounds.filter(
    (round) => round.kind === "sequential"
  );

  if (sequentialRounds.length === 0) {
    throw badRequest("A composed match must contain a sequential first round");
  }

  const matchIds = rounds.map((round) => round.matchId);

  if (new Set(matchIds).size !== matchIds.length) {
    throw badRequest("A physical match cannot appear more than once");
  }

  const sequentialNumbers = sequentialRounds.map((round) => round.number);

  if (sequentialNumbers.some((number, index) => number !== index + 1)) {
    throw badRequest("Sequential rounds must be contiguous starting at 1");
  }

  const extraTimeRounds = rounds.filter((round) => round.kind === "extra-time");

  if (extraTimeRounds.length > 1) {
    throw badRequest("A composed match can contain only one extra time");
  }

  const extraTimeIndex = rounds.findIndex(
    (round) => round.kind === "extra-time"
  );

  if (extraTimeIndex !== -1 && extraTimeIndex !== rounds.length - 1) {
    throw badRequest("Extra time must be the final round");
  }

  const matches = rounds.map((round) => {
    const match = matchesByPublicId.get(round.matchId);

    if (!match) {
      throw new Error("Validated composition round is missing its match");
    }

    return match;
  });

  if (matches.some((match) => match?.status !== "completed")) {
    throw badRequest("Only completed matches can be bound");
  }

  const first = matches[0];

  if (!first) {
    throw new Error("Validated composition has no first match");
  }

  if (matches.some((match) => match?.gameModeId !== first.gameModeId)) {
    throw badRequest("All rounds must use the same game mode");
  }

  if (
    matches.some(
      (match) => match?.eventSchemaVersionId !== first.eventSchemaVersionId
    )
  ) {
    throw badRequest("All rounds must use the same event schema version");
  }
}

export function normalizeMatchScore(
  score: MatchScore,
  orientation: TeamOrientation
): MatchScore {
  return orientation === "aligned"
    ? score
    : { red: score.blue, blue: score.red };
}

export function resolveRoundTeamOrientations(
  rounds: Array<{
    requested: "auto" | TeamOrientation;
    score: MatchScore;
    players: TeamPlayers;
  }>,
  scoreMode: MatchCompositionScoreMode = "cumulative"
): TeamOrientation[] {
  const first = rounds[0];

  if (!first) {
    return [];
  }

  if (first.requested === "swapped") {
    throw badRequest("The first round establishes the team orientation");
  }

  const firstPlayers = first.players;
  const orientations: TeamOrientation[] = ["aligned"];
  let previousScore = first.score;

  for (const round of rounds.slice(1)) {
    const candidates: TeamOrientation[] =
      scoreMode === "per-game"
        ? ["aligned", "swapped"]
        : (["aligned", "swapped"] as const).filter((orientation) => {
            const score = normalizeMatchScore(round.score, orientation);

            return (
              score.red >= previousScore.red && score.blue >= previousScore.blue
            );
          });
    const requested = round.requested === "auto" ? null : round.requested;
    const orientation = requested
      ? resolveRequestedOrientation(candidates, requested)
      : resolveAutomaticOrientation(candidates, firstPlayers, round.players);

    if (!orientation) {
      if (requested || candidates.length === 0) {
        throw badRequest("Round scores must be cumulative");
      }

      throw badRequest(
        "Round team orientation is ambiguous; choose aligned or swapped"
      );
    }

    orientations.push(orientation);
    if (scoreMode === "cumulative") {
      previousScore = normalizeMatchScore(round.score, orientation);
    }
  }

  return orientations;
}

function resolveRequestedOrientation(
  candidates: TeamOrientation[],
  requested: TeamOrientation
): TeamOrientation | null {
  return candidates.includes(requested) ? requested : null;
}

function resolveAutomaticOrientation(
  candidates: TeamOrientation[],
  firstPlayers: TeamPlayers,
  currentPlayers: TeamPlayers
): TeamOrientation | null {
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }

  if (candidates.length !== 2) {
    return null;
  }

  const alignedOverlap =
    intersectionSize(firstPlayers.red, currentPlayers.red) +
    intersectionSize(firstPlayers.blue, currentPlayers.blue);
  const swappedOverlap =
    intersectionSize(firstPlayers.red, currentPlayers.blue) +
    intersectionSize(firstPlayers.blue, currentPlayers.red);

  if (alignedOverlap === swappedOverlap) {
    return null;
  }

  return alignedOverlap > swappedOverlap ? "aligned" : "swapped";
}

function intersectionSize(left: Set<number>, right: Set<number>): number {
  return Array.from(left).filter((value) => right.has(value)).length;
}
