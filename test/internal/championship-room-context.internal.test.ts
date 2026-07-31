import { describe, expect, it } from "bun:test";
import {
  championshipRoomContextRank,
  classifyChampionshipRoomContext
} from "@/features/championships/matches-statistics/room-context";

describe("championship room context", () => {
  const championshipUuid = "11111111-1111-4111-8111-111111111111";

  it.each([
    ["no physical room context", [], "untagged"],
    ["only null contexts", [null, undefined], "untagged"],
    ["one matching half", [championshipUuid], "matched"],
    ["two matching halves", [championshipUuid, championshipUuid], "matched"],
    [
      "one different championship",
      ["22222222-2222-4222-8222-222222222222"],
      "other"
    ],
    [
      "two halves from a different championship",
      [
        "22222222-2222-4222-8222-222222222222",
        "22222222-2222-4222-8222-222222222222"
      ],
      "other"
    ],
    ["mixed matching and untagged halves", [championshipUuid, null], "matched"],
    [
      "mixed championship contexts",
      [championshipUuid, "22222222-2222-4222-8222-222222222222"],
      "other"
    ]
  ] as const)("%s", (_label, contexts, expected) => {
    expect(classifyChampionshipRoomContext(championshipUuid, contexts)).toBe(
      expected
    );
  });

  it("ranks same-championship games ahead of untagged and other games", () => {
    expect(
      (["other", "untagged", "matched"] as const).toSorted(
        (left, right) =>
          championshipRoomContextRank(left) - championshipRoomContextRank(right)
      )
    ).toEqual(["matched", "untagged", "other"]);
  });
});
