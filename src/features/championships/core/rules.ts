import { Value } from "@sinclair/typebox/value";
import { type Static, t } from "elysia";
import { badRequest } from "@/shared/http/errors";

export const championshipRulesVersion = 1;

export const championshipRulesV1Schema = t.Object({
  match: t.Object({
    sequentialRoundCount: t.Integer({ minimum: 1, maximum: 10 }),
    switchSides: t.Boolean(),
    drawPolicy: t.Union([
      t.Literal("allowed"),
      t.Literal("overtime"),
      t.Literal("staff-decision")
    ]),
    overtimePolicy: t.Union([
      t.Literal("disabled"),
      t.Literal("separate-period"),
      t.Literal("manual")
    ]),
    overtimeRuleLabel: t.Union([t.String({ maxLength: 160 }), t.Null()]),
    fullForfeitScore: t.Object({
      winner: t.Integer({ minimum: 0 }),
      loser: t.Integer({ minimum: 0 })
    })
  }),
  roster: t.Object({
    minimumSize: t.Integer({ minimum: 0 }),
    maximumSize: t.Integer({ minimum: 1 }),
    lockPolicy: t.Union([
      t.Literal("unlocked"),
      t.Literal("draft-start"),
      t.Literal("competition-start")
    ])
  }),
  salary: t.Object({
    enabled: t.Boolean(),
    capUnits: t.Integer({ minimum: 0 }),
    displayLabel: t.String({ minLength: 1, maxLength: 32 }),
    maximumTradeDifference: t.Integer({ minimum: 0 })
  }),
  draft: t.Object({
    rounds: t.Integer({ minimum: 1, maximum: 100 }),
    countdownSeconds: t.Integer({ minimum: 0, maximum: 86_400 }),
    publicPrices: t.Boolean()
  }),
  scheduling: t.Object({
    authority: t.Union([
      t.Literal("staff"),
      t.Literal("gms"),
      t.Literal("staff-and-gms")
    ]),
    proposalMode: t.Union([
      t.Literal("exact-time"),
      t.Literal("availability-range"),
      t.Literal("both")
    ]),
    latePlayPolicy: t.Union([
      t.Literal("forbidden"),
      t.Literal("staff-approval"),
      t.Literal("allowed")
    ])
  })
});

export type ChampionshipRulesV1 = Static<typeof championshipRulesV1Schema>;

export type VersionedChampionshipRules = {
  schemaVersion: typeof championshipRulesVersion;
  rules: ChampionshipRulesV1;
};

export const defaultChampionshipRules: ChampionshipRulesV1 = {
  match: {
    sequentialRoundCount: 2,
    switchSides: true,
    drawPolicy: "overtime",
    overtimePolicy: "separate-period",
    overtimeRuleLabel: null,
    fullForfeitScore: {
      winner: 3,
      loser: 0
    }
  },
  roster: {
    minimumSize: 0,
    maximumSize: 12,
    lockPolicy: "draft-start"
  },
  salary: {
    enabled: false,
    capUnits: 0,
    displayLabel: "un.",
    maximumTradeDifference: 0
  },
  draft: {
    rounds: 1,
    countdownSeconds: 60,
    publicPrices: true
  },
  scheduling: {
    authority: "staff",
    proposalMode: "both",
    latePlayPolicy: "staff-approval"
  }
};

export function decodeChampionshipRules(
  schemaVersion: number,
  value: unknown
): ChampionshipRulesV1 {
  if (schemaVersion !== championshipRulesVersion) {
    throw badRequest(
      `Unsupported championship rules schema version: ${schemaVersion}`
    );
  }

  if (!Value.Check(championshipRulesV1Schema, value)) {
    throw badRequest("Championship rules are invalid");
  }

  if (value.roster.maximumSize < value.roster.minimumSize) {
    throw badRequest(
      "Championship roster maximum must be greater than or equal to its minimum"
    );
  }

  return structuredClone(value);
}
