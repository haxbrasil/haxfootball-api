export type ChampionshipRoomContext = "matched" | "other" | "untagged";

export function classifyChampionshipRoomContext(
  championshipUuid: string,
  contextUuids: Iterable<string | null | undefined>
): ChampionshipRoomContext {
  const contexts = new Set(
    [...contextUuids].filter((value): value is string => !!value)
  );

  if (contexts.size === 0) return "untagged";
  if (contexts.size === 1 && contexts.has(championshipUuid)) return "matched";
  return "other";
}

export function championshipRoomContextRank(value: ChampionshipRoomContext) {
  return value === "matched" ? 0 : value === "untagged" ? 1 : 2;
}
