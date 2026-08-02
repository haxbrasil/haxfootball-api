export type EvidenceOrientation = "aligned" | "swapped";

export function recommendEvidenceOrientation(
  rounds: ReadonlyArray<{
    participants: {
      items: ReadonlyArray<{
        player: { account: { uuid: string } | null };
        logicalSide: "a" | "b";
      }>;
    };
  }>,
  match: { sideATeamId: number | null; sideBTeamId: number | null },
  rosterByAccountUuid: ReadonlyMap<string, number>
) {
  if (match.sideATeamId === null || match.sideBTeamId === null) return null;

  const scores = { aligned: 0, swapped: 0 };

  for (const round of rounds) {
    for (const appearance of round.participants.items) {
      const accountUuid = appearance.player.account?.uuid;
      if (!accountUuid) continue;

      const rosterTeamId = rosterByAccountUuid.get(accountUuid);
      if (rosterTeamId === undefined) continue;

      const alignedTeamId =
        appearance.logicalSide === "a" ? match.sideATeamId : match.sideBTeamId;
      const swappedTeamId =
        appearance.logicalSide === "a" ? match.sideBTeamId : match.sideATeamId;

      if (rosterTeamId === alignedTeamId) scores.aligned += 1;
      if (rosterTeamId === swappedTeamId) scores.swapped += 1;
    }
  }

  if (scores.aligned === scores.swapped) return null;

  const orientation: EvidenceOrientation =
    scores.swapped > scores.aligned ? "swapped" : "aligned";

  return {
    orientation,
    matchedPlayers: scores[orientation],
    opposingPlayers: scores[orientation === "aligned" ? "swapped" : "aligned"]
  };
}
