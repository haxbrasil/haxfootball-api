import { describe, expect, it } from "bun:test";
import {
  generateDoubleEliminationPlan,
  generateSingleEliminationPlan,
  nextPowerOfTwo,
  standardSeedOrder
} from "@/features/championships/format-scheduling/bracket-engine";

describe("championship single-elimination graph engine", () => {
  it.each([
    [2, 2],
    [3, 4],
    [4, 4],
    [5, 8],
    [9, 16],
    [17, 32],
    [33, 64],
    [64, 64]
  ])("uses the smallest bracket for %d teams", (teams, expected) => {
    expect(nextPowerOfTwo(teams)).toBe(expected);
  });

  it.each([1, 3, 5, 6, 7, 9, 15, 31, 63, 65])(
    "rejects invalid bracket size %d",
    (size) => {
      expect(() => standardSeedOrder(size)).toThrow();
    }
  );

  it.each(Array.from({ length: 63 }, (_, index) => index + 2))(
    "materializes a connected and seeded graph for %d teams",
    (teamCount) => {
      const plan = generateSingleEliminationPlan(teamCount);
      const destinationKeys = new Set(plan.spots.map((spot) => spot.key));
      const matchKeys = new Set(plan.matches.map((match) => match.key));
      const firstRoundTeams = plan.spots
        .filter((spot) => spot.key.startsWith("r1-"))
        .map((spot) => spot.teamIndex)
        .filter((team): team is number => team !== null)
        .sort((left, right) => left - right);

      expect(plan.matches).toHaveLength(plan.bracketSize - 1);
      expect(plan.roundCount).toBe(Math.log2(plan.bracketSize));
      expect(new Set(plan.seedOrder).size).toBe(plan.bracketSize);
      expect(firstRoundTeams).toEqual(
        Array.from({ length: teamCount }, (_, index) => index)
      );
      expect(
        plan.routes.every(
          (route) =>
            matchKeys.has(route.sourceMatchKey) &&
            destinationKeys.has(route.destinationSpotKey)
        )
      ).toBe(true);
      expect(
        plan.routes.filter(
          (route) => route.destinationSpotKey === "placement-champion"
        )
      ).toHaveLength(1);
      expect(
        plan.matches.filter((match) => match.byeTeamIndex !== null)
      ).toHaveLength(plan.bracketSize - teamCount);
    }
  );

  it("uses standard seed protection for an eight-team bracket", () => {
    expect(standardSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe("championship double-elimination graph engine", () => {
  it.each(
    Array.from({ length: 63 }, (_, index) => index + 2).flatMap((teamCount) => [
      [teamCount, false] as const,
      [teamCount, true] as const
    ])
  )(
    "materializes a valid graph for %d teams with reset=%s",
    (teamCount, grandFinalReset) => {
      const plan = generateDoubleEliminationPlan(teamCount, grandFinalReset);
      const spotKeys = new Set(plan.spots.map((spot) => spot.key));
      const matchKeys = new Set(plan.matches.map((match) => match.key));
      const initialTeams = plan.spots
        .map((spot) => spot.teamIndex)
        .filter((team): team is number => team !== null)
        .sort((left, right) => left - right);

      expect(matchKeys.size).toBe(plan.matches.length);
      expect(spotKeys.size).toBe(plan.spots.length);
      expect(plan.matches).toHaveLength(
        2 * (plan.bracketSize - 1) + (grandFinalReset ? 1 : 0)
      );
      expect(new Set(initialTeams)).toEqual(
        new Set(Array.from({ length: teamCount }, (_, index) => index))
      );
      expect(
        plan.routes.every(
          (route) =>
            matchKeys.has(route.sourceMatchKey) &&
            spotKeys.has(route.destinationSpotKey)
        )
      ).toBe(true);
      expect(
        plan.matches.filter((match) => match.bracket === "grand-final")
      ).toHaveLength(grandFinalReset ? 2 : 1);
      expect(
        plan.routes.filter(
          (route) => route.destinationSpotKey === "placement-champion"
        )
      ).toHaveLength(grandFinalReset ? 2 : 1);
      expect(
        plan.routes.filter(
          (route) => route.destinationSpotKey === "placement-runner-up"
        )
      ).toHaveLength(grandFinalReset ? 2 : 1);
    }
  );

  it("creates the canonical connected four-team bracket", () => {
    const plan = generateDoubleEliminationPlan(4, false);

    expect(
      plan.matches.map(({ key, bracket, round, position }) => ({
        key,
        bracket,
        round,
        position
      }))
    ).toEqual([
      { key: "w-r1-m1", bracket: "winners", round: 1, position: 1 },
      { key: "w-r1-m2", bracket: "winners", round: 1, position: 2 },
      { key: "w-r2-m1", bracket: "winners", round: 2, position: 1 },
      { key: "l-r1-m1", bracket: "losers", round: 1, position: 1 },
      { key: "l-r2-m1", bracket: "losers", round: 2, position: 1 },
      {
        key: "grand-final-1",
        bracket: "grand-final",
        round: 1,
        position: 1
      }
    ]);
    expect(
      plan.routes
        .filter((route) => route.sourceOutcome === "loser")
        .map((route) => `${route.sourceMatchKey}->${route.destinationSpotKey}`)
    ).toEqual(
      expect.arrayContaining([
        "w-r1-m1->l-r1-m1-a",
        "w-r1-m2->l-r1-m1-b",
        "w-r2-m1->l-r2-m1-b",
        "grand-final-1->placement-runner-up"
      ])
    );
  });

  it("routes a lower-bracket grand-final win into a conditional reset", () => {
    const plan = generateDoubleEliminationPlan(8, true);
    const firstFinalRoutes = plan.routes.filter(
      (route) => route.sourceMatchKey === "grand-final-1"
    );

    expect(firstFinalRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destinationSpotKey: "placement-champion",
          sourceOutcome: "winner",
          condition: "if-side-a-wins"
        }),
        expect.objectContaining({
          destinationSpotKey: "grand-final-reset-a",
          sourceOutcome: "loser",
          condition: "if-side-b-wins"
        }),
        expect.objectContaining({
          destinationSpotKey: "grand-final-reset-b",
          sourceOutcome: "winner",
          condition: "if-side-b-wins"
        })
      ])
    );
  });
});
