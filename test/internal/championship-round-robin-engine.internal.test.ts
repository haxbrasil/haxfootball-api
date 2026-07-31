import { describe, expect, it } from "bun:test";
import {
  generateRoundRobinPlan,
  type RoundRobinTeam
} from "@/features/championships/format-scheduling/round-robin-engine";

function teams(groupSizes: number[]): RoundRobinTeam[] {
  let id = 0;

  return groupSizes.flatMap((size, groupIndex) =>
    Array.from({ length: size }, () => {
      id += 1;
      return {
        id,
        uuid: crypto.randomUUID(),
        name: `Team ${id}`,
        groupUuid: `00000000-0000-4000-8000-${String(groupIndex).padStart(12, "0")}`
      };
    })
  );
}

describe("championship round-robin engine", () => {
  for (const size of Array.from({ length: 16 }, (_, index) => index + 2)) {
    for (const meetings of [1, 2, 3]) {
      it(`generates ${meetings} meeting(s) for a ${size}-team group`, () => {
        const participants = teams([size]);
        const plan = generateRoundRobinPlan({
          teams: participants,
          existingMatches: [],
          sameGroupMeetings: meetings,
          crossGroupMeetings: 0,
          pairOverrides: [],
          competitionRoundUuids: []
        });
        const expected = (size * (size - 1) * meetings) / 2;

        expect(plan.desiredMatchCount).toBe(expected);
        expect(plan.missingMatchCount).toBe(expected);
        expect(
          new Set(
            plan.pairings.flatMap((pairing) => [
              pairing.sideATeamId,
              pairing.sideBTeamId
            ])
          ).size
        ).toBe(size);
        expect(
          plan.matchCountsByTeam.every(
            (row) => row.desired === (size - 1) * meetings
          )
        ).toBe(true);
      });
    }
  }

  it("combines same-group and cross-group frequencies", () => {
    const plan = generateRoundRobinPlan({
      teams: teams([3, 3]),
      existingMatches: [],
      sameGroupMeetings: 2,
      crossGroupMeetings: 1,
      pairOverrides: [],
      competitionRoundUuids: []
    });

    expect(plan.desiredMatchCount).toBe(21);
    expect(
      plan.pairings.filter((pairing) => pairing.groupUuid !== null)
    ).toHaveLength(12);
    expect(
      plan.pairings.filter((pairing) => pairing.groupUuid === null)
    ).toHaveLength(9);
  });

  it("applies an unordered group-pair override", () => {
    const participants = teams([2, 2]);
    const [groupA, groupB] = [
      participants[0]!.groupUuid,
      participants[2]!.groupUuid
    ];
    const plan = generateRoundRobinPlan({
      teams: participants,
      existingMatches: [],
      sameGroupMeetings: 0,
      crossGroupMeetings: 1,
      pairOverrides: [{ groupAUuid: groupB, groupBUuid: groupA, meetings: 3 }],
      competitionRoundUuids: []
    });

    expect(plan.desiredMatchCount).toBe(12);
  });

  it("preserves manual matches and reports only missing meetings", () => {
    const participants = teams([4]);
    const plan = generateRoundRobinPlan({
      teams: participants,
      existingMatches: [
        { sideATeamId: 1, sideBTeamId: 2 },
        { sideATeamId: 2, sideBTeamId: 1 },
        { sideATeamId: 1, sideBTeamId: 2 }
      ],
      sameGroupMeetings: 2,
      crossGroupMeetings: 0,
      pairOverrides: [],
      competitionRoundUuids: []
    });

    expect(plan.desiredMatchCount).toBe(12);
    expect(plan.missingMatchCount).toBe(10);
    expect(plan.excessMatchCount).toBe(1);
    expect(
      plan.pairings.filter(
        (pairing) =>
          new Set([pairing.sideATeamId, pairing.sideBTeamId]).has(1) &&
          new Set([pairing.sideATeamId, pairing.sideBTeamId]).has(2)
      )
    ).toHaveLength(2);
  });

  it("cycles generated games through the available competition rounds", () => {
    const plan = generateRoundRobinPlan({
      teams: teams([4]),
      existingMatches: [],
      sameGroupMeetings: 1,
      crossGroupMeetings: 0,
      pairOverrides: [],
      competitionRoundUuids: ["round-a", "round-b"]
    });

    expect(
      plan.pairings.map((pairing) => pairing.competitionRoundUuid)
    ).toEqual([
      "round-a",
      "round-b",
      "round-a",
      "round-b",
      "round-a",
      "round-b"
    ]);
  });
});
