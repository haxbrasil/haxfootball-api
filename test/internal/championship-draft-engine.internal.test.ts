import { describe, expect, it } from "bun:test";
import {
  draftTurnDeadline,
  generateSerpentineTurns,
  reopenedDraftTurnState
} from "@/features/championships/draft-trades/draft-engine";

describe("championship serpentine draft engine", () => {
  it.each([
    {
      teams: 2,
      rounds: 3,
      expected: [0, 1, 1, 0, 0, 1]
    },
    {
      teams: 3,
      rounds: 2,
      expected: [0, 1, 2, 2, 1, 0]
    },
    {
      teams: 4,
      rounds: 3,
      expected: [0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3]
    }
  ])(
    "materializes $teams teams across $rounds rounds",
    ({ teams, rounds, expected }) => {
      const turns = generateSerpentineTurns(teams, rounds);

      expect(turns.map(({ teamIndex }) => teamIndex)).toEqual(
        Array.from(expected)
      );
      expect(turns.map(({ sequence }) => sequence)).toEqual(
        Array.from({ length: turns.length }, (_, index) => index + 1)
      );
    }
  );

  it.each(
    Array.from({ length: 15 }, (_, teamOffset) => teamOffset + 2).flatMap(
      (teams) =>
        Array.from({ length: 8 }, (_, roundOffset) => ({
          teams,
          rounds: roundOffset + 1
        }))
    )
  )(
    "selects every team exactly once in each round ($teams/$rounds)",
    ({ teams, rounds }) => {
      const turns = generateSerpentineTurns(teams, rounds);

      expect(turns).toHaveLength(teams * rounds);

      for (let round = 1; round <= rounds; round += 1) {
        const roundTurns = turns.filter((turn) => turn.round === round);

        expect(new Set(roundTurns.map(({ teamIndex }) => teamIndex)).size).toBe(
          teams
        );
        expect(roundTurns.map(({ position }) => position)).toEqual(
          round % 2 === 1
            ? Array.from({ length: teams }, (_, index) => index + 1)
            : Array.from({ length: teams }, (_, index) => teams - index)
        );
      }
    }
  );

  it.each([
    { teams: 1, rounds: 1 },
    { teams: 65, rounds: 1 },
    { teams: 2, rounds: 0 },
    { teams: 2, rounds: 101 },
    { teams: 2.5, rounds: 2 },
    { teams: 2, rounds: 1.5 }
  ])(
    "rejects invalid materialization bounds ($teams/$rounds)",
    ({ teams, rounds }) => {
      expect(() => generateSerpentineTurns(teams, rounds)).toThrow(RangeError);
    }
  );

  it("treats zero countdown as untimed and computes timed deadlines", () => {
    const openedAt = new Date("2026-08-01T20:00:00.000Z");

    expect(draftTurnDeadline(openedAt, 0)).toBeNull();
    expect(draftTurnDeadline(openedAt, 75)).toBe("2026-08-01T20:01:15.000Z");
  });

  it.each([
    { turn: 1, frontier: 2, expected: "overdue" },
    { turn: 4, frontier: 4, expected: "open" },
    { turn: 5, frontier: 4, expected: "open" }
  ] as const)(
    "reopens corrected turn $turn against frontier $frontier as $expected",
    ({ turn, frontier, expected }) => {
      expect(reopenedDraftTurnState(turn, frontier)).toBe(expected);
    }
  );
});
