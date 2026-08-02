import { type Static, t } from "elysia";
import {
  championshipMatchOutcomeSchema,
  championshipResultMethodSchema
} from "@/features/championships/matches-statistics/inputs";
import { logicalMatchEvidenceResponseSchema } from "@/features/matches/read-logical-match-evidence";

const teamReferenceSchema = t.Nullable(
  t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String(),
    abbreviation: t.Nullable(t.String()),
    colors: t.Nullable(t.Array(t.String()))
  })
);

const boundedSchema = <T extends ReturnType<typeof t.Object>>(item: T) =>
  t.Object({
    items: t.Array(item),
    totalCount: t.Integer({ minimum: 0 }),
    truncated: t.Boolean()
  });

export const championshipEvidenceCandidateResponseSchema = t.Object({
  evidence: logicalMatchEvidenceResponseSchema,
  expectedProgram: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      name: t.String()
    })
  ),
  programCompatible: t.Boolean(),
  orientationRecommendation: t.Nullable(
    t.Object({
      orientation: t.Union([t.Literal("aligned"), t.Literal("swapped")]),
      matchedPlayers: t.Integer({ minimum: 0 }),
      opposingPlayers: t.Integer({ minimum: 0 })
    })
  ),
  championshipContext: t.Union([
    t.Literal("matched"),
    t.Literal("other"),
    t.Literal("untagged")
  ]),
  alreadyClaimed: t.Boolean()
});

export const championshipEvidenceCandidatesResponseSchema = t.Object({
  items: t.Array(championshipEvidenceCandidateResponseSchema),
  nextCursor: t.Nullable(t.String()),
  totalInspected: t.Integer({ minimum: 0 })
});

export const championshipMatchAppearanceResponseSchema = t.Object({
  sourcePlayerId: t.String(),
  sourceAccountUuid: t.Nullable(t.String({ format: "uuid" })),
  displayName: t.String(),
  observedSide: t.Union([t.Literal("a"), t.Literal("b")]),
  playingTimeSeconds: t.Number({ minimum: 0 }),
  registered: t.Boolean(),
  onRoster: t.Boolean(),
  findings: t.Array(t.String()),
  attribution: t.Object({
    mode: t.Union([
      t.Literal("default"),
      t.Literal("exclude"),
      t.Literal("redirect")
    ]),
    targetParticipantUuid: t.Nullable(t.String({ format: "uuid" })),
    targetDisplayName: t.Nullable(t.String()),
    reason: t.Nullable(t.String())
  })
});

export const championshipMatchResultResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  revision: t.Integer({ minimum: 1 }),
  state: t.Union([
    t.Literal("current"),
    t.Literal("superseded"),
    t.Literal("invalidated")
  ]),
  method: championshipResultMethodSchema,
  sideAPlayedScore: t.Integer({ minimum: 0 }),
  sideBPlayedScore: t.Integer({ minimum: 0 }),
  sideAAdministrativeScore: t.Integer({ minimum: 0 }),
  sideBAdministrativeScore: t.Integer({ minimum: 0 }),
  sideAOfficialScore: t.Integer({ minimum: 0 }),
  sideBOfficialScore: t.Integer({ minimum: 0 }),
  sideAOutcome: championshipMatchOutcomeSchema,
  sideBOutcome: championshipMatchOutcomeSchema,
  evidenceDerived: t.Boolean(),
  note: t.Nullable(t.String()),
  settledAt: t.String(),
  supersededAt: t.Nullable(t.String())
});

const progressionImpactSchema = t.Object({
  routeUuid: t.String({ format: "uuid" }),
  outcome: t.Union([t.Literal("winner"), t.Literal("loser")]),
  destinationSpotUuid: t.String({ format: "uuid" }),
  destinationSpotLabel: t.String(),
  previousTeam: teamReferenceSchema,
  nextTeam: teamReferenceSchema
});

const downstreamImpactSchema = t.Object({
  matchUuid: t.String({ format: "uuid" }),
  label: t.String(),
  depth: t.Integer({ minimum: 1 }),
  hadResult: t.Boolean(),
  hadEvidence: t.Boolean(),
  schedulePreserved: t.Boolean()
});

export const championshipSettlementPreviewResponseSchema = t.Object({
  previewHash: t.String(),
  championshipRevision: t.Integer({ minimum: 0 }),
  evidenceRevision: t.Integer({ minimum: 0 }),
  resultRevision: t.Integer({ minimum: 0 }),
  match: t.Object({
    uuid: t.String({ format: "uuid" }),
    label: t.String(),
    sideA: teamReferenceSchema,
    sideB: teamReferenceSchema
  }),
  result: t.Object({
    method: championshipResultMethodSchema,
    sideAPlayedScore: t.Integer({ minimum: 0 }),
    sideBPlayedScore: t.Integer({ minimum: 0 }),
    sideAAdministrativeScore: t.Integer({ minimum: 0 }),
    sideBAdministrativeScore: t.Integer({ minimum: 0 }),
    sideAOfficialScore: t.Integer({ minimum: 0 }),
    sideBOfficialScore: t.Integer({ minimum: 0 }),
    sideAOutcome: championshipMatchOutcomeSchema,
    sideBOutcome: championshipMatchOutcomeSchema
  }),
  findings: t.Array(
    t.Object({
      code: t.String(),
      severity: t.Union([
        t.Literal("info"),
        t.Literal("warning"),
        t.Literal("blocking")
      ]),
      message: t.String()
    })
  ),
  appearances: t.Array(championshipMatchAppearanceResponseSchema),
  progression: t.Array(progressionImpactSchema),
  downstream: t.Array(downstreamImpactSchema)
});

export const championshipMatchOperationsResponseSchema = t.Object({
  championshipUuid: t.String({ format: "uuid" }),
  championshipRevision: t.Integer({ minimum: 0 }),
  match: t.Object({
    uuid: t.String({ format: "uuid" }),
    label: t.String(),
    sideA: teamReferenceSchema,
    sideB: teamReferenceSchema,
    scheduledAt: t.Nullable(t.String()),
    scheduleStatus: t.String(),
    expectedProgram: t.Nullable(
      t.Object({
        uuid: t.String({ format: "uuid" }),
        name: t.String()
      })
    ),
    evidenceRevision: t.Integer({ minimum: 0 }),
    resultRevision: t.Integer({ minimum: 0 }),
    scheduleRevision: t.Integer({ minimum: 0 }),
    revision: t.Integer({ minimum: 0 })
  }),
  evidence: t.Nullable(logicalMatchEvidenceResponseSchema),
  evidenceNote: t.Nullable(t.String()),
  evidenceOrientation: t.Nullable(
    t.Union([t.Literal("aligned"), t.Literal("swapped")])
  ),
  result: t.Nullable(championshipMatchResultResponseSchema),
  appearances: boundedSchema(championshipMatchAppearanceResponseSchema),
  resultHistory: boundedSchema(championshipMatchResultResponseSchema)
});

const teamStandingSchema = t.Object({
  team: teamReferenceSchema,
  played: t.Integer({ minimum: 0 }),
  wins: t.Integer({ minimum: 0 }),
  draws: t.Integer({ minimum: 0 }),
  losses: t.Integer({ minimum: 0 }),
  pointsFor: t.Integer(),
  pointsAgainst: t.Integer(),
  differential: t.Integer()
});

const playerStatisticSchema = t.Object({
  participantUuid: t.Nullable(t.String({ format: "uuid" })),
  accountUuid: t.Nullable(t.String({ format: "uuid" })),
  displayName: t.String(),
  matchesPlayed: t.Integer({ minimum: 0 }),
  playingTimeSeconds: t.Number({ minimum: 0 }),
  metrics: t.Record(t.String(), t.Number()),
  sourceSeparatedMetrics: t.Array(
    t.Object({
      eventSchema: t.Nullable(t.String()),
      program: t.Nullable(t.String()),
      metrics: t.Record(t.String(), t.Number())
    })
  )
});

export const championshipStatisticsResponseSchema = t.Object({
  championshipUuid: t.String({ format: "uuid" }),
  resultRevision: t.Integer({ minimum: 0 }),
  teams: boundedSchema(teamStandingSchema),
  players: boundedSchema(playerStatisticSchema),
  metricSources: boundedSchema(
    t.Object({
      eventSchemaId: t.String({ format: "uuid" }),
      eventSchemaName: t.String(),
      eventSchemaVersion: t.Integer({ minimum: 1 }),
      metricKey: t.String(),
      label: t.Nullable(t.String()),
      valueKind: t.Union([
        t.Literal("integer"),
        t.Literal("number"),
        t.Literal("duration"),
        t.Literal("percentage")
      ]),
      mappedCanonicalMetricKey: t.Nullable(t.String())
    })
  )
});

export const championshipMetricMappingResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  canonicalMetricKey: t.String(),
  displayLabel: t.String(),
  valueKind: t.Union([
    t.Literal("integer"),
    t.Literal("number"),
    t.Literal("duration"),
    t.Literal("percentage")
  ]),
  aggregation: t.Union([
    t.Literal("sum"),
    t.Literal("average"),
    t.Literal("maximum"),
    t.Literal("minimum")
  ]),
  source: t.Object({
    eventSchemaId: t.String({ format: "uuid" }),
    eventSchemaName: t.String(),
    eventSchemaVersion: t.Integer({ minimum: 1 }),
    metricKey: t.String()
  }),
  revision: t.Integer({ minimum: 0 }),
  updatedAt: t.String()
});

export const championshipMetricMappingsResponseSchema = t.Object({
  championshipUuid: t.String({ format: "uuid" }),
  items: t.Array(championshipMetricMappingResponseSchema),
  totalCount: t.Integer({ minimum: 0 }),
  truncated: t.Boolean()
});

export type ChampionshipSettlementPreviewResponse = Static<
  typeof championshipSettlementPreviewResponseSchema
>;
export type ChampionshipMatchOperationsResponse = Static<
  typeof championshipMatchOperationsResponseSchema
>;
export type ChampionshipStatisticsResponse = Static<
  typeof championshipStatisticsResponseSchema
>;
export type ChampionshipMetricMappingsResponse = Static<
  typeof championshipMetricMappingsResponseSchema
>;
