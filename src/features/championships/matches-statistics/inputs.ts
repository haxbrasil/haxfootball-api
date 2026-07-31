import { type Static, t } from "elysia";
import {
  championshipCommandSchema,
  championshipUuidSchema
} from "@/features/championships/_shared/http/inputs";
import {
  logicalMatchPublicIdSchema,
  matchRoundInputSchema
} from "@/features/matches/_shared/http/inputs";

export const championshipMatchOperationsParamsSchema = t.Object({
  id: championshipUuidSchema,
  championshipMatchId: t.String({ format: "uuid" })
});

export const championshipMatchOperationsQuerySchema = t.Object({
  actorAccountUuid: t.Optional(t.String({ format: "uuid" }))
});

export const championshipEvidenceCandidatesQuerySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  logicalMatchId: t.Optional(logicalMatchPublicIdSchema),
  playerSearch: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  initiatedFrom: t.Optional(t.String({ minLength: 1 })),
  initiatedTo: t.Optional(t.String({ minLength: 1 })),
  minimumTotalScore: t.Optional(t.Integer({ minimum: 0 })),
  maximumTotalScore: t.Optional(t.Integer({ minimum: 0 })),
  quality: t.Optional(
    t.Union([
      t.Literal("complete"),
      t.Literal("recovered"),
      t.Literal("partial"),
      t.Literal("legacy")
    ])
  ),
  claimState: t.Optional(
    t.Union([t.Literal("available"), t.Literal("claimed"), t.Literal("all")])
  ),
  includeAllPrograms: t.Optional(t.Boolean()),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
  cursor: t.Optional(t.String({ minLength: 1 }))
});

export const attachChampionshipMatchEvidenceBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedEvidenceRevision: t.Integer({ minimum: 0 }),
    logicalMatchId: t.Optional(logicalMatchPublicIdSchema),
    composition: t.Optional(
      t.Object({
        rounds: t.Array(matchRoundInputSchema, {
          minItems: 2,
          maxItems: 10
        })
      })
    ),
    orientation: t.Union([t.Literal("aligned"), t.Literal("swapped")]),
    note: t.Optional(t.Union([t.String({ maxLength: 2_000 }), t.Null()]))
  })
]);

export const detachChampionshipMatchEvidenceBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedEvidenceRevision: t.Integer({ minimum: 0 }),
    reason: t.String({ minLength: 1, maxLength: 2_000 })
  })
]);

export const championshipResultMethodSchema = t.Union([
  t.Literal("played"),
  t.Literal("manual"),
  t.Literal("full-forfeit"),
  t.Literal("mid-game-forfeit"),
  t.Literal("double-forfeit"),
  t.Literal("historical")
]);

export const championshipMatchOutcomeSchema = t.Union([
  t.Literal("win"),
  t.Literal("loss"),
  t.Literal("draw")
]);

export const championshipAttributionInputSchema = t.Object({
  sourcePlayerId: t.String({ minLength: 1 }),
  mode: t.Union([
    t.Literal("default"),
    t.Literal("exclude"),
    t.Literal("redirect")
  ]),
  targetParticipantUuid: t.Optional(
    t.Union([t.String({ format: "uuid" }), t.Null()])
  ),
  reason: t.Optional(t.Union([t.String({ maxLength: 1_000 }), t.Null()]))
});

export const championshipSettlementDraftSchema = t.Object({
  method: championshipResultMethodSchema,
  sideAPlayedScore: t.Integer({ minimum: 0 }),
  sideBPlayedScore: t.Integer({ minimum: 0 }),
  sideAAdministrativeScore: t.Optional(t.Integer({ minimum: 0 })),
  sideBAdministrativeScore: t.Optional(t.Integer({ minimum: 0 })),
  sideAOutcome: championshipMatchOutcomeSchema,
  sideBOutcome: championshipMatchOutcomeSchema,
  note: t.Optional(t.Union([t.String({ maxLength: 4_000 }), t.Null()])),
  evidenceQualityReviewed: t.Boolean(),
  programMismatchReason: t.Optional(
    t.Union([t.String({ minLength: 1, maxLength: 2_000 }), t.Null()])
  ),
  attributions: t.Optional(
    t.Array(championshipAttributionInputSchema, {
      maxItems: 500
    })
  )
});

export const previewChampionshipSettlementBodySchema = t.Intersect([
  championshipSettlementDraftSchema,
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" })
  })
]);

export const settleChampionshipMatchBodySchema = t.Composite([
  championshipCommandSchema,
  championshipSettlementDraftSchema,
  t.Object({
    expectedEvidenceRevision: t.Integer({ minimum: 0 }),
    expectedResultRevision: t.Integer({ minimum: 0 }),
    previewHash: t.String({
      minLength: 64,
      maxLength: 64,
      pattern: "^[a-f0-9]{64}$"
    })
  })
]);

export const updateChampionshipAttributionsBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedResultRevision: t.Integer({ minimum: 1 }),
    attributions: t.Array(championshipAttributionInputSchema, {
      maxItems: 500
    })
  })
]);

export const championshipStatisticsQuerySchema = t.Object({
  actorAccountUuid: t.Optional(t.String({ format: "uuid" })),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 500 })),
  offset: t.Optional(t.Integer({ minimum: 0 }))
});

export const championshipMetricMappingsQuerySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 500 })),
  offset: t.Optional(t.Integer({ minimum: 0 }))
});

export const replaceChampionshipMetricMappingsBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    mappings: t.Array(
      t.Object({
        eventSchemaId: t.String({ format: "uuid" }),
        eventSchemaVersion: t.Integer({ minimum: 1 }),
        sourceMetricKey: t.String({ minLength: 1, maxLength: 120 }),
        canonicalMetricKey: t.String({ minLength: 1, maxLength: 120 }),
        displayLabel: t.String({ minLength: 1, maxLength: 160 }),
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
        ])
      }),
      { maxItems: 500 }
    )
  })
]);

export type ChampionshipEvidenceCandidatesQuery = Static<
  typeof championshipEvidenceCandidatesQuerySchema
>;
export type AttachChampionshipMatchEvidenceInput = Static<
  typeof attachChampionshipMatchEvidenceBodySchema
>;
export type DetachChampionshipMatchEvidenceInput = Static<
  typeof detachChampionshipMatchEvidenceBodySchema
>;
export type ChampionshipSettlementDraft = Static<
  typeof championshipSettlementDraftSchema
>;
export type ChampionshipAttributionInput = Static<
  typeof championshipAttributionInputSchema
>;
export type PreviewChampionshipSettlementInput = Static<
  typeof previewChampionshipSettlementBodySchema
>;
export type SettleChampionshipMatchInput = Static<
  typeof settleChampionshipMatchBodySchema
>;
export type UpdateChampionshipAttributionsInput = Static<
  typeof updateChampionshipAttributionsBodySchema
>;
export type ChampionshipStatisticsQuery = Static<
  typeof championshipStatisticsQuerySchema
>;
export type ChampionshipMetricMappingsQuery = Static<
  typeof championshipMetricMappingsQuerySchema
>;
export type ReplaceChampionshipMetricMappingsInput = Static<
  typeof replaceChampionshipMetricMappingsBodySchema
>;
