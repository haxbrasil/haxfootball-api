import type { MatchRoundInput } from "@/features/matches/_shared/http/inputs";
import type { Match } from "@/features/matches/db";
import { badRequest } from "@/shared/http/errors";

export type MatchRoundReference =
  | { kind: "sequential"; number: number; matchId: string }
  | { kind: "extra-time"; number: null; matchId: string };

export function toMatchRoundReference(
  round: { kind: "sequential" | "extra-time"; roundNumber: number | null },
  matchId: string
): MatchRoundReference {
  if (round.kind === "sequential" && round.roundNumber !== null) {
    return { kind: "sequential", number: round.roundNumber, matchId };
  }

  if (round.kind === "extra-time" && round.roundNumber === null) {
    return { kind: "extra-time", number: null, matchId };
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

export function validateCumulativeMatchScores(
  scores: Array<{ red: number; blue: number }>
): void {
  const decreases = scores.some((score, index) => {
    const previous = scores[index - 1];

    return previous
      ? score.red < previous.red || score.blue < previous.blue
      : false;
  });

  if (decreases) {
    throw badRequest("Round scores must be cumulative");
  }
}
