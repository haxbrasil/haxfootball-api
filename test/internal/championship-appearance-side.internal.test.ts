import { describe, expect, test } from "bun:test";
import { resolveChampionshipAppearanceSide } from "@/features/championships/matches-statistics/appearance-side";

describe("resolveChampionshipAppearanceSide", () => {
  test("uses the only recorded side when legacy stints have no duration", () => {
    expect(
      resolveChampionshipAppearanceSide({ a: 0, b: 0 }, { a: 0, b: 1 })
    ).toEqual({ observedSide: "b", ambiguous: false });
  });

  test("continues to prefer the side with more playing time", () => {
    expect(
      resolveChampionshipAppearanceSide({ a: 120, b: 40 }, { a: 1, b: 1 })
    ).toEqual({ observedSide: "a", ambiguous: true });
  });

  test("marks a player appearing on both sides as ambiguous", () => {
    expect(
      resolveChampionshipAppearanceSide({ a: 0, b: 0 }, { a: 1, b: 1 })
    ).toEqual({ observedSide: "a", ambiguous: true });
  });
});
