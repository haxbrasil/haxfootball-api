import { describe, expect, it } from "bun:test";
import {
  normalizeMatchScore,
  resolveRoundTeamOrientations
} from "@/features/matches/_shared/domain/composition";

const noPlayers = { red: new Set<number>(), blue: new Set<number>() };

describe("match composition team orientation", () => {
  it("detects a side switch when it is the only cumulative orientation", () => {
    const orientations = resolveRoundTeamOrientations([
      {
        requested: "auto",
        score: { red: 7, blue: 35 },
        players: noPlayers
      },
      {
        requested: "auto",
        score: { red: 44, blue: 14 },
        players: noPlayers
      }
    ]);

    expect(orientations).toEqual(["aligned", "swapped"]);
    expect(normalizeMatchScore({ red: 44, blue: 14 }, "swapped")).toEqual({
      red: 14,
      blue: 44
    });
  });

  it("uses participant continuity when both score orientations are cumulative", () => {
    const orientations = resolveRoundTeamOrientations([
      {
        requested: "auto",
        score: { red: 1, blue: 1 },
        players: {
          red: new Set([1, 2, 3]),
          blue: new Set([4, 5, 6])
        }
      },
      {
        requested: "auto",
        score: { red: 2, blue: 3 },
        players: {
          red: new Set([4, 5, 7]),
          blue: new Set([1, 2, 8])
        }
      }
    ]);

    expect(orientations).toEqual(["aligned", "swapped"]);
  });

  it("requires an explicit orientation when automatic detection is ambiguous", () => {
    expect(() =>
      resolveRoundTeamOrientations([
        {
          requested: "auto",
          score: { red: 0, blue: 0 },
          players: noPlayers
        },
        {
          requested: "auto",
          score: { red: 1, blue: 1 },
          players: noPlayers
        }
      ])
    ).toThrow("Round team orientation is ambiguous; choose aligned or swapped");
  });

  it("honors a valid explicit orientation and rejects an invalid one", () => {
    expect(
      resolveRoundTeamOrientations([
        {
          requested: "auto",
          score: { red: 2, blue: 1 },
          players: noPlayers
        },
        {
          requested: "aligned",
          score: { red: 3, blue: 2 },
          players: noPlayers
        }
      ])
    ).toEqual(["aligned", "aligned"]);

    expect(() =>
      resolveRoundTeamOrientations([
        {
          requested: "auto",
          score: { red: 7, blue: 35 },
          players: noPlayers
        },
        {
          requested: "aligned",
          score: { red: 44, blue: 14 },
          players: noPlayers
        }
      ])
    ).toThrow("Round scores must be cumulative");
  });

  it("accepts independent per-game scores and uses players for orientation", () => {
    const orientations = resolveRoundTeamOrientations(
      [
        {
          requested: "auto",
          score: { red: 4, blue: 2 },
          players: {
            red: new Set([1, 2, 3]),
            blue: new Set([4, 5, 6])
          }
        },
        {
          requested: "auto",
          score: { red: 3, blue: 1 },
          players: {
            red: new Set([4, 5, 7]),
            blue: new Set([1, 2, 8])
          }
        }
      ],
      "per-game"
    );

    expect(orientations).toEqual(["aligned", "swapped"]);
  });

  it("allows explicit per-game orientation without cumulative scores", () => {
    expect(
      resolveRoundTeamOrientations(
        [
          {
            requested: "auto",
            score: { red: 6, blue: 1 },
            players: noPlayers
          },
          {
            requested: "swapped",
            score: { red: 2, blue: 0 },
            players: noPlayers
          }
        ],
        "per-game"
      )
    ).toEqual(["aligned", "swapped"]);
  });
});
