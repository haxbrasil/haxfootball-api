import { describe, expect, it } from "bun:test";
import {
  calculateStandings,
  type StandingsMatch,
  type StandingsRule,
  type StandingsTeam
} from "@/features/championships/format-scheduling/standings-engine";

const teams = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  uuid: `team-${index + 1}`,
  name: `Team ${index + 1}`,
  displayOrder: index
}));
const scoring = { win: 3, draw: 1, loss: 0 };

describe("championship standings engine", () => {
  it.each(
    Array.from({ length: 11 }, (_, sideA) =>
      Array.from({ length: 11 }, (_, sideB) => [sideA, sideB] as const)
    ).flat()
  )("classifies an official %d-%d result", (sideA, sideB) => {
    const result = standings(
      teams.slice(0, 2),
      [match("one", 1, 2, sideA, sideB)],
      rules("points", "score-difference", "score-for")
    );

    if (sideA === sideB) {
      expect(result.rows.map((row) => row.points)).toEqual([1, 1]);
      expect(result.unresolvedTies).toHaveLength(1);
    } else {
      expect(result.rows[0]!.team.id).toBe(sideA > sideB ? 1 : 2);
      expect(result.rows.map((row) => row.points)).toEqual([3, 0]);
      expect(result.unresolvedTies).toEqual([]);
    }
    expect(result.rows.reduce((sum, row) => sum + row.scoreFor, 0)).toBe(
      sideA + sideB
    );
    expect(result.rows.reduce((sum, row) => sum + row.scoreDifference, 0)).toBe(
      0
    );
  });

  it.each([
    { win: 2, draw: 1, loss: 0 },
    { win: 3, draw: 1, loss: 0 },
    { win: 5, draw: 2, loss: 0 },
    { win: 3, draw: 0, loss: -1 }
  ])("uses configurable outcome points: %j", (points) => {
    const result = calculateStandings({
      teams: teams.slice(0, 3),
      matches: [
        match("a", 1, 2, 1, 0),
        match("b", 1, 3, 2, 2),
        match("c", 2, 3, 0, 3)
      ],
      rules: rules("points", "score-difference"),
      scoring: points,
      headToHeadRestart: "continue"
    });

    expect(result.rows.find((row) => row.team.id === 1)?.points).toBe(
      points.win + points.draw
    );
    expect(result.rows.find((row) => row.team.id === 2)?.points).toBe(
      points.loss * 2
    );
  });

  it("counts a double forfeit as a loss for both without inventing score", () => {
    const result = calculateStandings({
      teams: teams.slice(0, 2),
      matches: [
        {
          ...match("forfeit", 1, 2, 0, 0),
          sideAOutcome: "loss",
          sideBOutcome: "loss"
        }
      ],
      rules: rules("points", "wins", "score-difference"),
      scoring,
      headToHeadRestart: "continue"
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        losses: 1,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        unresolvedTie: true
      }),
      expect.objectContaining({
        losses: 1,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        unresolvedTie: true
      })
    ]);
  });

  it("uses only the tied cohort for head-to-head mini-table values", () => {
    const result = standings(
      teams,
      [
        match("1-2", 1, 2, 1, 0),
        match("1-3", 1, 3, 0, 3),
        match("2-3", 2, 3, 4, 0),
        match("1-4", 1, 4, 5, 0),
        match("2-4", 2, 4, 1, 0),
        match("3-4", 3, 4, 2, 0)
      ],
      rules("points", "head-to-head-points", "score-difference")
    );
    const row1 = result.rows.find((row) => row.team.id === 1)!;
    const headToHead = row1.criteria.find(
      (criterion) => criterion.criterion === "head-to-head-points"
    );

    expect(headToHead).toMatchObject({
      scope: "head-to-head",
      value: 3
    });
    expect(result.rows.slice(0, 3).map((row) => row.team.id)).toEqual([
      2, 1, 3
    ]);
  });

  it("restarts head-to-head criteria for a subgroup after a partial split", () => {
    const matches = [
      match("1-2", 1, 2, 2, 0),
      match("1-3", 1, 3, 0, 1),
      match("2-3", 2, 3, 3, 0),
      match("1-4", 1, 4, 1, 0),
      match("2-4", 2, 4, 1, 0),
      match("3-4", 3, 4, 1, 0)
    ];
    const criteria = rules(
      "points",
      "head-to-head-points",
      "head-to-head-score-difference"
    );
    const continued = calculateStandings({
      teams,
      matches,
      rules: criteria,
      scoring,
      headToHeadRestart: "continue"
    });
    const restarted = calculateStandings({
      teams,
      matches,
      rules: criteria,
      scoring,
      headToHeadRestart: "restart-for-subgroup"
    });

    expect(continued.rows).toHaveLength(4);
    expect(restarted.rows).toHaveLength(4);
    expect(
      restarted.rows.every((row) =>
        row.criteria.some((criterion) => criterion.scope === "head-to-head")
      )
    ).toBe(true);
  });

  it("supports an audited staff order as the final criterion", () => {
    const result = calculateStandings({
      teams: teams.slice(0, 3),
      matches: [],
      rules: [
        { criterion: "points", direction: "desc" },
        {
          criterion: "manual",
          direction: "asc",
          config: { teamOrder: ["team-3", "team-1", "team-2"] }
        }
      ],
      scoring,
      headToHeadRestart: "continue"
    });

    expect(result.rows.map((row) => row.team.uuid)).toEqual([
      "team-3",
      "team-1",
      "team-2"
    ]);
    expect(result.unresolvedTies).toEqual([]);
  });

  it("marks a deterministic display order without pretending a tie is resolved", () => {
    const result = standings(teams.slice(0, 3), [], rules("points"));

    expect(result.rows.map((row) => [row.rank, row.team.id])).toEqual([
      [1, 1],
      [1, 2],
      [1, 3]
    ]);
    expect(result.unresolvedTies[0]).toMatchObject({
      rankFrom: 1,
      rankTo: 3,
      teamUuids: ["team-1", "team-2", "team-3"]
    });
  });

  it("deduplicates accidental repeated group spot occupants", () => {
    const result = standings(
      [teams[0]!, teams[0]!, teams[1]!],
      [match("one", 1, 2, 1, 0)],
      rules("points")
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.team.id)).toEqual([1, 2]);
  });

  it("counts cross-group matches for the teams being classified", () => {
    const result = standings(
      teams.slice(0, 2),
      [match("1-3", 1, 3, 4, 1), match("2-4", 2, 4, 0, 2)],
      rules("points", "score-difference")
    );

    expect(result.rows.map((row) => row.team.id)).toEqual([1, 2]);
    expect(result.rows[0]).toMatchObject({
      played: 1,
      points: 3,
      scoreFor: 4,
      scoreAgainst: 1
    });
    expect(result.rows[1]).toMatchObject({
      played: 1,
      points: 0,
      scoreFor: 0,
      scoreAgainst: 2
    });
  });
});

function standings(
  selectedTeams: StandingsTeam[],
  matches: StandingsMatch[],
  selectedRules: StandingsRule[]
) {
  return calculateStandings({
    teams: selectedTeams,
    matches,
    rules: selectedRules,
    scoring,
    headToHeadRestart: "continue"
  });
}

function rules(
  ...criteria: Array<StandingsRule["criterion"]>
): StandingsRule[] {
  return criteria.map((criterion) => ({
    criterion,
    direction:
      criterion === "score-against" || criterion === "manual" ? "asc" : "desc"
  }));
}

function match(
  uuid: string,
  sideATeamId: number,
  sideBTeamId: number,
  sideAOfficialScore: number,
  sideBOfficialScore: number
): StandingsMatch {
  const sideAOutcome =
    sideAOfficialScore > sideBOfficialScore
      ? "win"
      : sideAOfficialScore < sideBOfficialScore
        ? "loss"
        : "draw";
  const sideBOutcome =
    sideAOutcome === "win" ? "loss" : sideAOutcome === "loss" ? "win" : "draw";

  return {
    uuid,
    sideATeamId,
    sideBTeamId,
    sideAOfficialScore,
    sideBOfficialScore,
    sideAOutcome,
    sideBOutcome
  };
}
