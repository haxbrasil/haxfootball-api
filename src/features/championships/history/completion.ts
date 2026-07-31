export function championshipMatchNeedsSettlement(match: {
  resultRevision: number;
  matchRulesOverride: unknown;
  sideATeamId: number | null;
  sideBTeamId: number | null;
}): boolean {
  if (match.resultRevision > 0) return false;
  const rules =
    match.matchRulesOverride && typeof match.matchRulesOverride === "object"
      ? (match.matchRulesOverride as Record<string, unknown>)
      : null;

  if (rules?.bye === true) return false;
  if (
    rules?.conditional === true &&
    match.sideATeamId === null &&
    match.sideBTeamId === null
  ) {
    return false;
  }

  return true;
}
