export type ChampionshipAppearanceSide = "a" | "b";

type SideValues = Record<ChampionshipAppearanceSide, number>;

export function resolveChampionshipAppearanceSide(
  playingTime: SideValues,
  appearanceCounts: SideValues
) {
  const observedSide: ChampionshipAppearanceSide =
    playingTime.a === playingTime.b
      ? appearanceCounts.a >= appearanceCounts.b
        ? "a"
        : "b"
      : playingTime.a > playingTime.b
        ? "a"
        : "b";

  return {
    observedSide,
    ambiguous: appearanceCounts.a > 0 && appearanceCounts.b > 0
  };
}
