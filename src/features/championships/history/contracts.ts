import { type Static, t } from "elysia";
import { championshipCommandSchema } from "@/features/championships/_shared/http/inputs";
import { paginatedResponseSchema, paginationQuerySchema } from "@lib";
import { historicalImportEntityTypes } from "@/features/championships/history/import-parser";

const historicalImportEntityTypeSchema = t.Union(
  historicalImportEntityTypes.map((value) => t.Literal(value))
);

export const championshipHistoryQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    actorAccountUuid: t.Optional(t.String({ format: "uuid" })),
    kind: t.Optional(t.String({ minLength: 1, maxLength: 80 }))
  })
]);

export const championshipAwardTargetSchema = t.Object({
  type: t.Union([
    t.Literal("team"),
    t.Literal("team-identity"),
    t.Literal("participant"),
    t.Literal("account"),
    t.Literal("historical-player")
  ]),
  uuid: t.String({ format: "uuid" })
});

export const championshipHonorKindSchema = t.Union([
  t.Literal("title"),
  t.Literal("award")
]);

export const championshipHonorRecipientTypeSchema = t.Union([
  t.Literal("team"),
  t.Literal("team-identity"),
  t.Literal("participant"),
  t.Literal("account"),
  t.Literal("historical-player")
]);

export const championshipHonorDecisionPolicySchema = t.Union([
  t.Object({
    type: t.Literal("placement"),
    ranks: t.Array(t.Integer({ minimum: 1, maximum: 1_000 }), {
      minItems: 1,
      maxItems: 128,
      uniqueItems: true
    })
  }),
  t.Object({
    type: t.Literal("spot-result"),
    spotUuids: t.Array(t.String({ format: "uuid" }), {
      minItems: 1,
      maxItems: 128,
      uniqueItems: true
    }),
    outcome: t.Union([
      t.Literal("winner"),
      t.Literal("loser"),
      t.Literal("occupant")
    ])
  }),
  t.Object({
    type: t.Literal("metric-ranking"),
    metricKey: t.String({ minLength: 1, maxLength: 160 }),
    direction: t.Union([t.Literal("highest"), t.Literal("lowest")]),
    limit: t.Integer({ minimum: 1, maximum: 128 })
  }),
  t.Object({ type: t.Literal("staff-selection") }),
  t.Object({
    type: t.Literal("hybrid"),
    note: t.String({ minLength: 1, maxLength: 2_000 })
  })
]);

const championshipHonorDefinitionFieldsSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 160 }),
  description: t.Optional(t.Union([t.String({ maxLength: 2_000 }), t.Null()])),
  recipientTypes: t.Array(championshipHonorRecipientTypeSchema, {
    minItems: 1,
    maxItems: 5,
    uniqueItems: true
  }),
  minimumRecipients: t.Integer({ minimum: 0, maximum: 128 }),
  maximumRecipients: t.Integer({ minimum: 1, maximum: 128 }),
  aggregateByIdentity: t.Boolean(),
  presentation: t.Optional(t.Record(t.String(), t.Unknown()))
});

export const createChampionshipHonorDefinitionBodySchema = t.Composite([
  championshipHonorDefinitionFieldsSchema,
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" }),
    competitionTypeId: t.String({ format: "uuid" }),
    slug: t.String({
      minLength: 1,
      maxLength: 80,
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
    }),
    kind: championshipHonorKindSchema
  })
]);

export const updateChampionshipHonorDefinitionDraftBodySchema = t.Composite([
  championshipHonorDefinitionFieldsSchema,
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" }),
    expectedRevision: t.Integer({ minimum: 0 })
  })
]);

export const publishChampionshipHonorDefinitionBodySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  expectedRevision: t.Integer({ minimum: 0 })
});

export const archiveChampionshipHonorDefinitionBodySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  expectedRevision: t.Integer({ minimum: 0 }),
  archived: t.Boolean()
});

export const championshipHonorDefinitionIdParamsSchema = t.Object({
  definitionId: t.String({ format: "uuid" })
});

export const listChampionshipHonorDefinitionsQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    kind: t.Optional(championshipHonorKindSchema),
    competitionTypeId: t.Optional(t.String({ format: "uuid" })),
    state: t.Optional(
      t.Union([t.Literal("active"), t.Literal("archived"), t.Literal("all")])
    )
  })
]);

export const championshipHonorDefinitionResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  slug: t.String(),
  competitionType: t.Object({
    uuid: t.String({ format: "uuid" }),
    slug: t.String(),
    name: t.String()
  }),
  kind: championshipHonorKindSchema,
  state: t.Union([t.Literal("active"), t.Literal("archived")]),
  revision: t.Integer({ minimum: 0 }),
  draft: t.Object({
    name: t.String(),
    description: t.Nullable(t.String()),
    recipientTypes: t.Array(championshipHonorRecipientTypeSchema),
    minimumRecipients: t.Integer(),
    maximumRecipients: t.Integer(),
    aggregateByIdentity: t.Boolean(),
    presentation: t.Record(t.String(), t.Unknown()),
    revision: t.Integer({ minimum: 0 }),
    updatedAt: t.String()
  }),
  versions: t.Array(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      version: t.Integer({ minimum: 1 }),
      name: t.String(),
      description: t.Nullable(t.String()),
      recipientTypes: t.Array(championshipHonorRecipientTypeSchema),
      minimumRecipients: t.Integer(),
      maximumRecipients: t.Integer(),
      aggregateByIdentity: t.Boolean(),
      presentation: t.Record(t.String(), t.Unknown()),
      publishedAt: t.String()
    })
  ),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listChampionshipHonorDefinitionsResponseSchema =
  paginatedResponseSchema(championshipHonorDefinitionResponseSchema);

export const createChampionshipHonorBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    definitionVersionUuid: t.String({ format: "uuid" }),
    state: t.Optional(t.Union([t.Literal("draft"), t.Literal("announced")])),
    nameOverride: t.Optional(t.Union([t.String({ maxLength: 160 }), t.Null()])),
    descriptionOverride: t.Optional(
      t.Union([t.String({ maxLength: 2_000 }), t.Null()])
    ),
    decisionPolicy: championshipHonorDecisionPolicySchema,
    displayOrder: t.Optional(t.Integer({ minimum: 0, maximum: 10_000 }))
  })
]);

export const updateChampionshipHonorBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    state: t.Optional(
      t.Union([
        t.Literal("draft"),
        t.Literal("announced"),
        t.Literal("deciding"),
        t.Literal("void")
      ])
    ),
    nameOverride: t.Optional(t.Union([t.String({ maxLength: 160 }), t.Null()])),
    descriptionOverride: t.Optional(
      t.Union([t.String({ maxLength: 2_000 }), t.Null()])
    ),
    decisionPolicy: t.Optional(championshipHonorDecisionPolicySchema),
    displayOrder: t.Optional(t.Integer({ minimum: 0, maximum: 10_000 })),
    reason: t.String({ minLength: 3, maxLength: 2_000 })
  })
]);

export const reorderChampionshipHonorsBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    honorUuids: t.Array(t.String({ format: "uuid" }), {
      minItems: 1,
      maxItems: 128,
      uniqueItems: true
    })
  })
]);

export const createChampionshipHonorGrantBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    target: championshipAwardTargetSchema,
    rank: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
    note: t.Optional(t.Union([t.String({ maxLength: 2_000 }), t.Null()])),
    reason: t.String({ minLength: 3, maxLength: 2_000 })
  })
]);

export const revokeChampionshipHonorGrantBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({ reason: t.String({ minLength: 3, maxLength: 2_000 }) })
]);

export const championshipHonorResolutionContenderSchema = t.Object({
  target: championshipAwardTargetSchema,
  displayLabel: t.String(),
  rank: t.Integer({ minimum: 1 }),
  value: t.Nullable(t.Number()),
  tied: t.Boolean()
});

export const championshipHonorResolutionPreviewResponseSchema = t.Object({
  honorUuid: t.String({ format: "uuid" }),
  policy: championshipHonorDecisionPolicySchema,
  ready: t.Boolean(),
  explanation: t.String(),
  blockers: t.Array(t.String()),
  contenders: t.Array(championshipHonorResolutionContenderSchema, {
    maxItems: 128
  })
});

export const resolveChampionshipHonorBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({ reason: t.String({ minLength: 3, maxLength: 2_000 }) })
]);

export const championshipHonorIdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
  honorId: t.String({ format: "uuid" })
});

export const championshipHonorGrantIdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
  honorId: t.String({ format: "uuid" }),
  grantId: t.String({ format: "uuid" })
});

export const championshipHonorsQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    actorAccountUuid: t.Optional(t.String({ format: "uuid" })),
    includeDrafts: t.Optional(t.Boolean())
  })
]);

export const championshipHonorResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  state: t.Union([
    t.Literal("draft"),
    t.Literal("announced"),
    t.Literal("deciding"),
    t.Literal("awarded"),
    t.Literal("void")
  ]),
  revision: t.Integer({ minimum: 0 }),
  displayOrder: t.Integer(),
  name: t.String(),
  description: t.Nullable(t.String()),
  kind: championshipHonorKindSchema,
  definition: t.Object({
    uuid: t.String({ format: "uuid" }),
    slug: t.String(),
    versionUuid: t.String({ format: "uuid" }),
    version: t.Integer({ minimum: 1 }),
    recipientTypes: t.Array(championshipHonorRecipientTypeSchema),
    minimumRecipients: t.Integer(),
    maximumRecipients: t.Integer(),
    aggregateByIdentity: t.Boolean(),
    presentation: t.Record(t.String(), t.Unknown())
  }),
  decisionPolicy: championshipHonorDecisionPolicySchema,
  grants: t.Array(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      target: championshipAwardTargetSchema,
      displayLabel: t.String(),
      identitySnapshot: t.Nullable(
        t.Object({ uuid: t.String({ format: "uuid" }), name: t.String() })
      ),
      rank: t.Nullable(t.Integer()),
      note: t.Nullable(t.String()),
      awardedAt: t.String(),
      revokedAt: t.Nullable(t.String()),
      revocationReason: t.Nullable(t.String())
    })
  ),
  announcedAt: t.Nullable(t.String()),
  awardedAt: t.Nullable(t.String()),
  voidedAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listChampionshipHonorsResponseSchema = paginatedResponseSchema(
  championshipHonorResponseSchema
);

export const championshipPlacementInputSchema = t.Object({
  teamUuid: t.String({ format: "uuid" }),
  rank: t.Integer({ minimum: 1, maximum: 1_000 })
});

export const replaceChampionshipPlacementsBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    placements: t.Array(championshipPlacementInputSchema, {
      minItems: 1,
      maxItems: 128
    }),
    source: t.Optional(
      t.Union([
        t.Literal("format"),
        t.Literal("staff"),
        t.Literal("historical-import")
      ])
    ),
    reason: t.String({ minLength: 3, maxLength: 2_000 })
  })
]);

export const createChampionshipAwardBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    kind: t.String({ minLength: 1, maxLength: 80 }),
    rank: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
    target: championshipAwardTargetSchema,
    displayLabel: t.String({ minLength: 1, maxLength: 160 }),
    note: t.Optional(t.Union([t.String({ maxLength: 2_000 }), t.Null()]))
  })
]);

export const updateChampionshipAwardBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    kind: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
    rank: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
    target: t.Optional(championshipAwardTargetSchema),
    displayLabel: t.Optional(t.String({ minLength: 1, maxLength: 160 })),
    note: t.Optional(t.Union([t.String({ maxLength: 2_000 }), t.Null()])),
    reason: t.String({ minLength: 3, maxLength: 2_000 })
  })
]);

export const championshipAwardIdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
  awardId: t.String({ format: "uuid" })
});

export const previewChampionshipHistoricalImportBodySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  format: t.Union([t.Literal("csv"), t.Literal("json")]),
  sourceName: t.String({ minLength: 1, maxLength: 255 }),
  source: t.String({ minLength: 1, maxLength: 5_000_000 }),
  mapping: t.Object({
    entityTypeColumn: t.Optional(
      t.Union([t.String({ maxLength: 160 }), t.Null()])
    ),
    defaultEntityType: t.Optional(
      t.Union([historicalImportEntityTypeSchema, t.Null()])
    ),
    fieldMap: t.Optional(
      t.Record(
        t.String({ minLength: 1, maxLength: 120 }),
        t.String({ minLength: 1, maxLength: 160 })
      )
    )
  })
});

export const applyChampionshipHistoricalImportBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    reason: t.String({ minLength: 3, maxLength: 2_000 })
  })
]);

export const rollbackChampionshipHistoricalImportBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    reason: t.String({ minLength: 3, maxLength: 2_000 })
  })
]);

export const championshipHistoricalImportBatchIdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
  batchId: t.String({ format: "uuid" })
});

export const championshipHistoricalImportsQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" })
  })
]);

export const linkChampionshipHistoricalPlayerBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    accountUuid: t.Union([t.String({ format: "uuid" }), t.Null()]),
    expectedLinkedAccountUuid: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    ),
    reason: t.String({ minLength: 3, maxLength: 2_000 })
  })
]);

export const championshipHistoricalPlayerIdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
  historicalPlayerId: t.String({ format: "uuid" })
});

const championshipHistoricalImportRowResponseSchema = t.Object({
  rowNumber: t.Integer({ minimum: 1 }),
  sourceKey: t.Nullable(t.String()),
  entityType: t.Nullable(t.String()),
  entityUuid: t.Nullable(t.String({ format: "uuid" })),
  state: t.Union([
    t.Literal("valid"),
    t.Literal("warning"),
    t.Literal("invalid"),
    t.Literal("applied"),
    t.Literal("rolled-back")
  ]),
  raw: t.Unknown(),
  normalized: t.Unknown(),
  messages: t.Array(t.String())
});

export const championshipHistoricalImportBatchResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  championshipUuid: t.String({ format: "uuid" }),
  format: t.Union([t.Literal("csv"), t.Literal("json")]),
  sourceName: t.String(),
  sourceSha256: t.String(),
  mapping: t.Record(t.String(), t.Unknown()),
  state: t.Union([
    t.Literal("previewed"),
    t.Literal("applying"),
    t.Literal("applied"),
    t.Literal("failed"),
    t.Literal("rolled-back")
  ]),
  columns: t.Array(t.String()),
  rowCount: t.Integer({ minimum: 0 }),
  validCount: t.Integer({ minimum: 0 }),
  warningCount: t.Integer({ minimum: 0 }),
  invalidCount: t.Integer({ minimum: 0 }),
  appliedCount: t.Integer({ minimum: 0 }),
  errorCount: t.Integer({ minimum: 0 }),
  appliedAt: t.Nullable(t.String()),
  rolledBackAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
  rows: t.Object({
    items: t.Array(championshipHistoricalImportRowResponseSchema),
    totalCount: t.Integer({ minimum: 0 }),
    truncated: t.Boolean()
  })
});

export const listChampionshipHistoricalImportsResponseSchema =
  paginatedResponseSchema(championshipHistoricalImportBatchResponseSchema);

export const championshipHistoricalPlayerResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  displayName: t.String(),
  aliases: t.Array(t.String()),
  notes: t.Nullable(t.String()),
  linkedAccount: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      name: t.String()
    })
  ),
  linkedAt: t.Nullable(t.String()),
  updatedAt: t.String()
});

export const championshipHistoryTeamResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  abbreviation: t.Nullable(t.String()),
  identity: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      slug: t.String(),
      name: t.String()
    })
  )
});

export const championshipPlacementResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  rank: t.Integer(),
  source: t.Union([
    t.Literal("format"),
    t.Literal("staff"),
    t.Literal("historical-import")
  ]),
  team: championshipHistoryTeamResponseSchema,
  identitySnapshot: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      name: t.String()
    })
  ),
  teamNameSnapshot: t.String(),
  createdAt: t.String()
});

export const championshipAwardResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  kind: t.String(),
  rank: t.Nullable(t.Integer()),
  target: championshipAwardTargetSchema,
  displayLabel: t.String(),
  note: t.Nullable(t.String()),
  identitySnapshot: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      name: t.String()
    })
  ),
  awardedAt: t.String()
});

export const championshipRecordResponseSchema = t.Object({
  key: t.String(),
  category: t.Union([
    t.Literal("team"),
    t.Literal("player"),
    t.Literal("title"),
    t.Literal("award")
  ]),
  label: t.String(),
  targetUuid: t.String(),
  targetLabel: t.String(),
  value: t.Union([t.Number(), t.String()]),
  source: t.String()
});

export const championshipHistoryResponseSchema = t.Object({
  championship: t.Object({
    uuid: t.String({ format: "uuid" }),
    slug: t.String(),
    name: t.String(),
    editionLabel: t.Nullable(t.String()),
    lifecycle: t.String(),
    historical: t.Boolean(),
    completedAt: t.Nullable(t.String()),
    archivedAt: t.Nullable(t.String())
  }),
  completeness: t.Object({
    placements: t.Boolean(),
    awards: t.Boolean(),
    teams: t.Boolean(),
    rosters: t.Boolean(),
    matches: t.Boolean(),
    detailedStatistics: t.Boolean()
  }),
  placements: t.Object({
    items: t.Array(championshipPlacementResponseSchema),
    totalCount: t.Integer(),
    truncated: t.Boolean()
  }),
  awards: t.Object({
    items: t.Array(championshipAwardResponseSchema),
    totalCount: t.Integer(),
    truncated: t.Boolean()
  }),
  records: t.Object({
    items: t.Array(championshipRecordResponseSchema),
    totalCount: t.Integer(),
    truncated: t.Boolean()
  })
});

export const teamIdentityHistoryResponseSchema = t.Object({
  identity: t.Object({
    uuid: t.String({ format: "uuid" }),
    slug: t.String(),
    name: t.String(),
    abbreviation: t.Nullable(t.String())
  }),
  titles: t.Integer(),
  podiums: t.Integer(),
  editions: t.Array(
    t.Object({
      championshipUuid: t.String({ format: "uuid" }),
      championshipSlug: t.String(),
      championshipName: t.String(),
      editionLabel: t.Nullable(t.String()),
      rank: t.Integer(),
      teamNameSnapshot: t.String(),
      completedAt: t.Nullable(t.String())
    })
  ),
  truncated: t.Boolean()
});

export const accountChampionshipHistoryResponseSchema = t.Object({
  account: t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  editions: t.Array(
    t.Object({
      championshipUuid: t.String({ format: "uuid" }),
      championshipSlug: t.String(),
      championshipName: t.String(),
      displayNameSnapshot: t.String(),
      teamName: t.Nullable(t.String()),
      role: t.Nullable(t.Union([t.Literal("gm"), t.Literal("player")])),
      awards: t.Array(t.String()),
      completedAt: t.Nullable(t.String())
    })
  ),
  totalCount: t.Integer(),
  truncated: t.Boolean()
});

export const listChampionshipAwardsResponseSchema = paginatedResponseSchema(
  championshipAwardResponseSchema
);
export const listChampionshipPlacementsResponseSchema = paginatedResponseSchema(
  championshipPlacementResponseSchema
);

export type ChampionshipHistoryQuery = Static<
  typeof championshipHistoryQuerySchema
>;
export type ReplaceChampionshipPlacementsInput = Static<
  typeof replaceChampionshipPlacementsBodySchema
>;
export type CreateChampionshipAwardInput = Static<
  typeof createChampionshipAwardBodySchema
>;
export type UpdateChampionshipAwardInput = Static<
  typeof updateChampionshipAwardBodySchema
>;
export type ChampionshipHistoryResponse = Static<
  typeof championshipHistoryResponseSchema
>;
export type ChampionshipAwardResponse = Static<
  typeof championshipAwardResponseSchema
>;
export type ChampionshipPlacementResponse = Static<
  typeof championshipPlacementResponseSchema
>;
export type TeamIdentityHistoryResponse = Static<
  typeof teamIdentityHistoryResponseSchema
>;
export type AccountChampionshipHistoryResponse = Static<
  typeof accountChampionshipHistoryResponseSchema
>;
export type PreviewChampionshipHistoricalImportInput = Static<
  typeof previewChampionshipHistoricalImportBodySchema
>;
export type ApplyChampionshipHistoricalImportInput = Static<
  typeof applyChampionshipHistoricalImportBodySchema
>;
export type RollbackChampionshipHistoricalImportInput = Static<
  typeof rollbackChampionshipHistoricalImportBodySchema
>;
export type ChampionshipHistoricalImportsQuery = Static<
  typeof championshipHistoricalImportsQuerySchema
>;
export type ChampionshipHistoricalImportBatchResponse = Static<
  typeof championshipHistoricalImportBatchResponseSchema
>;
export type LinkChampionshipHistoricalPlayerInput = Static<
  typeof linkChampionshipHistoricalPlayerBodySchema
>;
export type ChampionshipHistoricalPlayerResponse = Static<
  typeof championshipHistoricalPlayerResponseSchema
>;
export type CreateChampionshipHonorDefinitionInput = Static<
  typeof createChampionshipHonorDefinitionBodySchema
>;
export type UpdateChampionshipHonorDefinitionDraftInput = Static<
  typeof updateChampionshipHonorDefinitionDraftBodySchema
>;
export type PublishChampionshipHonorDefinitionInput = Static<
  typeof publishChampionshipHonorDefinitionBodySchema
>;
export type ArchiveChampionshipHonorDefinitionInput = Static<
  typeof archiveChampionshipHonorDefinitionBodySchema
>;
export type ListChampionshipHonorDefinitionsQuery = Static<
  typeof listChampionshipHonorDefinitionsQuerySchema
>;
export type ChampionshipHonorDefinitionResponse = Static<
  typeof championshipHonorDefinitionResponseSchema
>;
export type CreateChampionshipHonorInput = Static<
  typeof createChampionshipHonorBodySchema
>;
export type UpdateChampionshipHonorInput = Static<
  typeof updateChampionshipHonorBodySchema
>;
export type ReorderChampionshipHonorsInput = Static<
  typeof reorderChampionshipHonorsBodySchema
>;
export type CreateChampionshipHonorGrantInput = Static<
  typeof createChampionshipHonorGrantBodySchema
>;
export type RevokeChampionshipHonorGrantInput = Static<
  typeof revokeChampionshipHonorGrantBodySchema
>;
export type ChampionshipHonorsQuery = Static<
  typeof championshipHonorsQuerySchema
>;
export type ChampionshipHonorResponse = Static<
  typeof championshipHonorResponseSchema
>;
export type ChampionshipHonorResolutionPreviewResponse = Static<
  typeof championshipHonorResolutionPreviewResponseSchema
>;
export type ResolveChampionshipHonorInput = Static<
  typeof resolveChampionshipHonorBodySchema
>;
