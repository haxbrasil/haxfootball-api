export type SerpentineTurn = {
  sequence: number;
  round: number;
  position: number;
  teamIndex: number;
};

export function generateSerpentineTurns(
  teamCount: number,
  rounds: number
): SerpentineTurn[] {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 64) {
    throw new RangeError("Drafts require between 2 and 64 teams");
  }

  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100) {
    throw new RangeError("Drafts require between 1 and 100 rounds");
  }

  const turns: SerpentineTurn[] = [];

  for (let round = 1; round <= rounds; round += 1) {
    const reverse = round % 2 === 0;

    for (let offset = 0; offset < teamCount; offset += 1) {
      const teamIndex = reverse ? teamCount - offset - 1 : offset;

      turns.push({
        sequence: turns.length + 1,
        round,
        position: teamIndex + 1,
        teamIndex
      });
    }
  }

  return turns;
}

export function draftTurnDeadline(
  openedAt: Date,
  countdownSeconds: number
): string | null {
  if (countdownSeconds === 0) {
    return null;
  }

  return new Date(openedAt.getTime() + countdownSeconds * 1_000).toISOString();
}

export function reopenedDraftTurnState(
  turnSequence: number,
  frontierSequence: number
): "open" | "overdue" {
  return turnSequence < frontierSequence ? "overdue" : "open";
}
