import { describe, expect, it } from "bun:test";
import { recommendEvidenceOrientation } from "@/features/championships/matches-statistics/evidence-orientation";

describe("championship evidence orientation recommendation", () => {
  it("recommends the orientation that maps registered players to their fixture sides", () => {
    const recommendation = recommendEvidenceOrientation(
      [
        {
          participants: {
            items: [player("a", "a"), player("b", "a"), player("c", "b")]
          }
        }
      ],
      { sideATeamId: 10, sideBTeamId: 20 },
      new Map([
        ["a", 20],
        ["b", 20],
        ["c", 10]
      ])
    );

    expect(recommendation).toEqual({
      orientation: "swapped",
      matchedPlayers: 3,
      opposingPlayers: 0
    });
  });

  it("does not guess when roster evidence is tied or absent", () => {
    expect(
      recommendEvidenceOrientation(
        [{ participants: { items: [player("a", "a"), player("b", "b")] } }],
        { sideATeamId: 10, sideBTeamId: 20 },
        new Map([
          ["a", 10],
          ["b", 10]
        ])
      )
    ).toBeNull();
  });
});

function player(accountUuid: string, logicalSide: "a" | "b") {
  return { player: { account: { uuid: accountUuid } }, logicalSide };
}
