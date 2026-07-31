import { describe, expect, it } from "bun:test";
import { championshipMatchNeedsSettlement } from "@/features/championships/history/completion";

describe("championship completion requirements", () => {
  it.each([
    {
      name: "settled match",
      match: {
        resultRevision: 1,
        matchRulesOverride: null,
        sideATeamId: 1,
        sideBTeamId: 2
      },
      expected: false
    },
    {
      name: "automatic bye",
      match: {
        resultRevision: 0,
        matchRulesOverride: { bye: true, automaticBye: true },
        sideATeamId: 1,
        sideBTeamId: null
      },
      expected: false
    },
    {
      name: "inactive conditional reset",
      match: {
        resultRevision: 0,
        matchRulesOverride: {
          conditional: true,
          activationCondition: "if-side-b-wins"
        },
        sideATeamId: null,
        sideBTeamId: null
      },
      expected: false
    },
    {
      name: "activated conditional reset",
      match: {
        resultRevision: 0,
        matchRulesOverride: {
          conditional: true,
          activationCondition: "if-side-b-wins"
        },
        sideATeamId: 1,
        sideBTeamId: 2
      },
      expected: true
    },
    {
      name: "partially populated conditional reset",
      match: {
        resultRevision: 0,
        matchRulesOverride: {
          conditional: true,
          activationCondition: "if-side-b-wins"
        },
        sideATeamId: 1,
        sideBTeamId: null
      },
      expected: true
    },
    {
      name: "ordinary unsettled match",
      match: {
        resultRevision: 0,
        matchRulesOverride: null,
        sideATeamId: 1,
        sideBTeamId: 2
      },
      expected: true
    }
  ])("$name", ({ match, expected }) => {
    expect(championshipMatchNeedsSettlement(match)).toBe(expected);
  });
});
