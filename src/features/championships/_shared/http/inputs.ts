import { type Static, t } from "elysia";
import { championshipRulesV1Schema } from "@/features/championships/core/rules";
import { paginationQuerySchema } from "@lib";

export const championshipUuidSchema = t.String({ format: "uuid" });
export const championshipSlugSchema = t.String({
  minLength: 2,
  maxLength: 80,
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
});

export const championshipCommandSchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  commandUuid: t.String({ format: "uuid" }),
  expectedRevision: t.Integer({ minimum: 0 })
});

export const championshipCreateCommandSchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  commandUuid: t.String({ format: "uuid" })
});

export const championshipIdParamsSchema = t.Object({
  id: championshipUuidSchema
});

export const championshipTeamIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  teamId: t.String({ format: "uuid" })
});

export const championshipTeamIdentityIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  teamIdentityId: t.String({ format: "uuid" })
});

export const championshipParticipantIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  participantId: t.String({ format: "uuid" })
});

export const championshipMembershipIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  membershipId: t.String({ format: "uuid" })
});

export const championshipDraftTurnIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  turnId: t.String({ format: "uuid" })
});

export const championshipTradeIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  tradeId: t.String({ format: "uuid" })
});

export const championshipStageIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  stageId: t.String({ format: "uuid" })
});

export const championshipGroupIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  stageId: t.String({ format: "uuid" }),
  groupId: t.String({ format: "uuid" })
});

export const championshipSpotIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  spotId: t.String({ format: "uuid" })
});

export const championshipRouteIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  routeId: t.String({ format: "uuid" })
});

export const championshipMatchIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  championshipMatchId: t.String({ format: "uuid" })
});

export const championshipScheduleProposalIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  championshipMatchId: t.String({ format: "uuid" }),
  proposalId: t.String({ format: "uuid" })
});

export const championshipLateAuthorizationIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  championshipMatchId: t.String({ format: "uuid" }),
  authorizationId: t.String({ format: "uuid" })
});

export const championshipThreadIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  threadId: t.String({ format: "uuid" })
});

export const championshipAssignmentIdParamsSchema = t.Object({
  id: championshipUuidSchema,
  assignmentId: t.String({ format: "uuid" })
});

export const championshipCompetitionTypeIdParamsSchema = t.Object({
  id: t.String({ format: "uuid" })
});

export const listCompetitionTypesQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    state: t.Optional(
      t.Union([t.Literal("active"), t.Literal("archived"), t.Literal("all")])
    )
  })
]);

export const createCompetitionTypeBodySchema = t.Composite([
  championshipCreateCommandSchema,
  t.Object({
    slug: championshipSlugSchema,
    name: t.String({ minLength: 1, maxLength: 120 }),
    description: t.Optional(
      t.Union([t.String({ maxLength: 2_000 }), t.Null()])
    ),
    cadence: t.Optional(
      t.Union([
        t.Literal("long-running"),
        t.Literal("multi-day"),
        t.Literal("single-event"),
        t.Null()
      ])
    ),
    defaultRules: championshipRulesV1Schema
  })
]);

export const updateCompetitionTypeBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    slug: t.Optional(championshipSlugSchema),
    name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
    description: t.Optional(
      t.Union([t.String({ maxLength: 2_000 }), t.Null()])
    ),
    cadence: t.Optional(
      t.Union([
        t.Literal("long-running"),
        t.Literal("multi-day"),
        t.Literal("single-event"),
        t.Null()
      ])
    ),
    defaultRules: t.Optional(championshipRulesV1Schema),
    state: t.Optional(t.Union([t.Literal("active"), t.Literal("archived")]))
  })
]);

export const listChampionshipsQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    slug: t.Optional(championshipSlugSchema),
    visibility: t.Optional(
      t.Union([t.Literal("public"), t.Literal("private"), t.Literal("all")])
    ),
    lifecycle: t.Optional(
      t.Union([
        t.Literal("setup"),
        t.Literal("active"),
        t.Literal("completed"),
        t.Literal("archived"),
        t.Literal("canceled")
      ])
    ),
    competitionTypeId: t.Optional(t.String({ format: "uuid" }))
  })
]);

export const listChampionshipParticipantsQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    status: t.Optional(
      t.Union([
        t.Literal("pending"),
        t.Literal("active"),
        t.Literal("withdrawn"),
        t.Literal("ineligible"),
        t.Literal("removed")
      ])
    )
  })
]);

export const transitionChampionshipRegistrationBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    operation: t.Union([t.Literal("open"), t.Literal("close")]),
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const selfRegisterChampionshipBodySchema = championshipCommandSchema;

export const championshipSelfRegistrationQuerySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" })
});

export const withdrawChampionshipRegistrationBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const createChampionshipParticipantBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    accountUuid: t.String({ format: "uuid" }),
    status: t.Optional(t.Union([t.Literal("pending"), t.Literal("active")])),
    priceUnits: t.Optional(t.Integer({ minimum: 0 })),
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const updateChampionshipParticipantBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    status: t.Union([
      t.Literal("pending"),
      t.Literal("active"),
      t.Literal("withdrawn"),
      t.Literal("ineligible"),
      t.Literal("removed")
    ]),
    priceUnits: t.Optional(t.Integer({ minimum: 0 })),
    reason: t.String({ minLength: 1, maxLength: 1_000 })
  })
]);

export const upsertChampionshipPricesBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    prices: t.Array(
      t.Object({
        participantId: t.String({ format: "uuid" }),
        priceUnits: t.Integer({ minimum: 0 })
      }),
      { minItems: 1, maxItems: 500 }
    )
  })
]);

export const freezeChampionshipPricesBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const championshipSalaryQuerySchema = t.Object({
  participantLimit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  participantCursor: t.Optional(t.String({ minLength: 1 })),
  teamLimit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  teamCursor: t.Optional(t.String({ minLength: 1 }))
});

export const championshipSalaryAdminQuerySchema = t.Composite([
  championshipSalaryQuerySchema,
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" })
  })
]);

export const championshipRosterHistoryQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    participantId: t.Optional(t.String({ format: "uuid" })),
    teamId: t.Optional(t.String({ format: "uuid" }))
  })
]);

export const previewChampionshipRosterMoveBodySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  participantId: t.String({ format: "uuid" }),
  targetTeamId: t.Union([t.String({ format: "uuid" }), t.Null()]),
  role: t.Optional(t.Union([t.Literal("gm"), t.Literal("player")]))
});

export const executeChampionshipRosterMoveBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    participantId: t.String({ format: "uuid" }),
    targetTeamId: t.Union([t.String({ format: "uuid" }), t.Null()]),
    role: t.Optional(t.Union([t.Literal("gm"), t.Literal("player")])),
    confirmCapException: t.Optional(t.Boolean()),
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const reorderChampionshipRosterBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    teamId: t.String({ format: "uuid" }),
    participantIds: t.Array(t.String({ format: "uuid" }), {
      minItems: 1,
      maxItems: 128,
      uniqueItems: true
    })
  })
]);

export const championshipDraftQuerySchema = t.Object({
  actorAccountUuid: t.Optional(t.String({ format: "uuid" })),
  turnLimit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  turnCursor: t.Optional(t.String({ minLength: 1 })),
  participantLimit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  participantCursor: t.Optional(t.String({ minLength: 1 }))
});

export const configureChampionshipDraftBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    teamIds: t.Array(t.String({ format: "uuid" }), {
      minItems: 2,
      maxItems: 64,
      uniqueItems: true
    }),
    rounds: t.Integer({ minimum: 1, maximum: 100 }),
    countdownSeconds: t.Integer({ minimum: 0, maximum: 86_400 })
  })
]);

export const startChampionshipDraftBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedDraftRevision: t.Integer({ minimum: 0 })
  })
]);

export const makeChampionshipDraftPickBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedDraftRevision: t.Integer({ minimum: 0 }),
    participantId: t.String({ format: "uuid" }),
    teamId: t.Optional(t.String({ format: "uuid" }))
  })
]);

export const endChampionshipDraftBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedDraftRevision: t.Integer({ minimum: 0 }),
    reason: t.String({ minLength: 1, maxLength: 1_000 })
  })
]);

export const championshipDraftCorrectionPreviewQuerySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" })
});

export const voidChampionshipDraftPickBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedDraftRevision: t.Integer({ minimum: 0 }),
    reason: t.String({ minLength: 1, maxLength: 1_000 })
  })
]);

export const listChampionshipTradesQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    actorAccountUuid: t.Optional(t.String({ format: "uuid" })),
    visibility: t.Optional(
      t.Union([t.Literal("public"), t.Literal("involved"), t.Literal("admin")])
    ),
    state: t.Optional(
      t.Union([
        t.Literal("proposed"),
        t.Literal("accepted"),
        t.Literal("rejected"),
        t.Literal("canceled"),
        t.Literal("expired")
      ])
    )
  })
]);

export const createChampionshipTradeBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    proposingTeamId: t.String({ format: "uuid" }),
    receivingTeamId: t.String({ format: "uuid" }),
    proposingParticipantIds: t.Array(t.String({ format: "uuid" }), {
      minItems: 1,
      maxItems: 20,
      uniqueItems: true
    }),
    receivingParticipantIds: t.Array(t.String({ format: "uuid" }), {
      minItems: 1,
      maxItems: 20,
      uniqueItems: true
    }),
    deadlineAt: t.Optional(t.String({ format: "date-time" }))
  })
]);

export const decideChampionshipTradeBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedTradeRevision: t.Integer({ minimum: 0 }),
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const championshipFormatQuerySchema = t.Object({
  actorAccountUuid: t.Optional(t.String({ format: "uuid" })),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 500 }))
});

const championshipStageEngineSchema = t.Union([
  t.Literal("manual"),
  t.Literal("single-elimination"),
  t.Literal("double-elimination"),
  t.Literal("standings")
]);

export const createChampionshipStageBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    name: t.String({ minLength: 1, maxLength: 120 }),
    engine: championshipStageEngineSchema,
    displayOrder: t.Optional(t.Integer({ minimum: 0 })),
    config: t.Optional(t.Record(t.String(), t.Unknown())),
    defaultRoomProgramId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    )
  })
]);

export const updateChampionshipStageBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedStageRevision: t.Integer({ minimum: 0 }),
    name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
    state: t.Optional(
      t.Union([t.Literal("draft"), t.Literal("active"), t.Literal("completed")])
    ),
    config: t.Optional(t.Record(t.String(), t.Unknown())),
    defaultRoomProgramId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    )
  })
]);

const championshipStandingsCriterionSchema = t.Union([
  t.Literal("points"),
  t.Literal("wins"),
  t.Literal("score-difference"),
  t.Literal("score-for"),
  t.Literal("score-against"),
  t.Literal("head-to-head"),
  t.Literal("head-to-head-points"),
  t.Literal("head-to-head-score-difference"),
  t.Literal("manual")
]);

export const createChampionshipGroupBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedStageRevision: t.Integer({ minimum: 0 }),
    name: t.String({ minLength: 1, maxLength: 120 }),
    displayOrder: t.Optional(t.Integer({ minimum: 0 })),
    teamIds: t.Optional(
      t.Array(t.String({ format: "uuid" }), {
        maxItems: 64,
        uniqueItems: true
      })
    )
  })
]);

export const configureChampionshipStandingsBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedStageRevision: t.Integer({ minimum: 0 }),
    scoring: t.Object({
      win: t.Integer({ minimum: -100, maximum: 100 }),
      draw: t.Integer({ minimum: -100, maximum: 100 }),
      loss: t.Integer({ minimum: -100, maximum: 100 })
    }),
    headToHeadRestart: t.Union([
      t.Literal("continue"),
      t.Literal("restart-for-subgroup")
    ]),
    rules: t.Array(
      t.Object({
        criterion: championshipStandingsCriterionSchema,
        direction: t.Union([t.Literal("asc"), t.Literal("desc")]),
        config: t.Optional(
          t.Union([t.Record(t.String(), t.Unknown()), t.Null()])
        )
      }),
      { minItems: 1, maxItems: 20 }
    )
  })
]);

export const championshipStandingsQuerySchema = t.Object({
  actorAccountUuid: t.Optional(t.String({ format: "uuid" }))
});

const roundRobinPairOverrideSchema = t.Object({
  groupAId: t.String({ format: "uuid" }),
  groupBId: t.String({ format: "uuid" }),
  meetings: t.Integer({ minimum: 0, maximum: 20 })
});

const roundRobinConfigurationSchema = t.Object({
  sameGroupMeetings: t.Integer({ minimum: 0, maximum: 20 }),
  crossGroupMeetings: t.Integer({ minimum: 0, maximum: 20 }),
  pairOverrides: t.Optional(
    t.Array(roundRobinPairOverrideSchema, {
      maxItems: 100
    })
  ),
  assignCompetitionRounds: t.Optional(t.Boolean())
});

export const previewChampionshipRoundRobinBodySchema = t.Composite([
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" })
  }),
  roundRobinConfigurationSchema
]);

export const generateChampionshipRoundRobinBodySchema = t.Composite([
  championshipCommandSchema,
  roundRobinConfigurationSchema,
  t.Object({
    expectedStageRevision: t.Integer({ minimum: 0 })
  })
]);

export const previewChampionshipClassificationBodySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" })
});

export const applyChampionshipClassificationBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedStageRevision: t.Integer({ minimum: 0 }),
    confirmedImpactMatchUuids: t.Array(t.String({ format: "uuid" }), {
      uniqueItems: true,
      maxItems: 500
    })
  })
]);

export const generateSingleEliminationBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    name: t.String({ minLength: 1, maxLength: 120 }),
    teamIds: t.Array(t.String({ format: "uuid" }), {
      minItems: 2,
      maxItems: 64,
      uniqueItems: true
    }),
    createCompetitionRounds: t.Optional(t.Boolean()),
    competitionRoundMode: t.Optional(
      t.Union([t.Literal("per-bracket-round"), t.Literal("single-period")])
    ),
    firstRoundStartsAt: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    roundDurationHours: t.Optional(t.Integer({ minimum: 1, maximum: 24 * 31 })),
    defaultRoomProgramId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    )
  })
]);

const doubleEliminationConfigurationSchema = t.Object({
  teamIds: t.Array(t.String({ format: "uuid" }), {
    minItems: 2,
    maxItems: 64,
    uniqueItems: true
  }),
  grandFinalReset: t.Boolean()
});

export const previewDoubleEliminationBodySchema = t.Composite([
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" })
  }),
  doubleEliminationConfigurationSchema
]);

export const generateDoubleEliminationBodySchema = t.Composite([
  championshipCommandSchema,
  doubleEliminationConfigurationSchema,
  t.Object({
    name: t.String({ minLength: 1, maxLength: 120 }),
    createCompetitionRounds: t.Optional(t.Boolean()),
    competitionRoundMode: t.Optional(
      t.Union([t.Literal("per-bracket-round"), t.Literal("single-period")])
    ),
    firstRoundStartsAt: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    roundDurationHours: t.Optional(t.Integer({ minimum: 1, maximum: 24 * 31 })),
    defaultRoomProgramId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    )
  })
]);

export const createChampionshipSpotBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    stageId: t.String({ format: "uuid" }),
    groupId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
    key: t.String({ minLength: 1, maxLength: 120 }),
    label: t.String({ minLength: 1, maxLength: 160 }),
    kind: t.Union([
      t.Literal("seed"),
      t.Literal("group-entry"),
      t.Literal("match-side"),
      t.Literal("qualification"),
      t.Literal("placement"),
      t.Literal("manual")
    ]),
    displayOrder: t.Optional(t.Integer({ minimum: 0 })),
    placementRank: t.Optional(
      t.Union([t.Integer({ minimum: 1, maximum: 1_000 }), t.Null()])
    ),
    teamId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
    x: t.Optional(t.Union([t.Integer(), t.Null()])),
    y: t.Optional(t.Union([t.Integer(), t.Null()]))
  })
]);

export const placeChampionshipSpotBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedSpotRevision: t.Integer({ minimum: 0 }),
    teamId: t.Union([t.String({ format: "uuid" }), t.Null()]),
    sourceSpotId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
    expectedSourceSpotRevision: t.Optional(
      t.Union([t.Integer({ minimum: 0 }), t.Null()])
    ),
    confirmedImpactMatchUuids: t.Array(t.String({ format: "uuid" }), {
      uniqueItems: true,
      maxItems: 500
    }),
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const previewChampionshipSpotPlacementBodySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  teamId: t.Union([t.String({ format: "uuid" }), t.Null()]),
  sourceSpotId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()]))
});

export const createChampionshipRouteBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    sourceKind: t.Union([
      t.Literal("match-outcome"),
      t.Literal("classification-rank"),
      t.Literal("manual")
    ]),
    sourceMatchId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    ),
    sourceGroupId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    ),
    sourceOutcome: t.Optional(
      t.Union([
        t.Literal("winner"),
        t.Literal("loser"),
        t.Literal("rank"),
        t.Null()
      ])
    ),
    sourceRank: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
    condition: t.Optional(
      t.Union([
        t.Literal("always"),
        t.Literal("if-side-a-wins"),
        t.Literal("if-side-b-wins")
      ])
    ),
    destinationSpotId: t.String({ format: "uuid" }),
    priority: t.Optional(t.Integer())
  })
]);

export const updateChampionshipRouteBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    state: t.Union([t.Literal("active"), t.Literal("disabled")])
  })
]);

export const createChampionshipCompetitionRoundBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    stageId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
    name: t.String({ minLength: 1, maxLength: 120 }),
    sequence: t.Integer({ minimum: 1 }),
    startsAt: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    endsAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
    schedulingAuthority: t.Optional(
      t.Union([
        t.Literal("staff"),
        t.Literal("gms"),
        t.Literal("staff-and-gms"),
        t.Null()
      ])
    ),
    latePlayPolicy: t.Optional(
      t.Union([
        t.Literal("forbidden"),
        t.Literal("staff-approval"),
        t.Literal("allowed"),
        t.Null()
      ])
    )
  })
]);

export const createChampionshipMatchBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    stageId: t.String({ format: "uuid" }),
    groupId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
    label: t.String({ minLength: 1, maxLength: 160 }),
    displayOrder: t.Optional(t.Integer({ minimum: 0 })),
    sideASpotId: t.String({ format: "uuid" }),
    sideBSpotId: t.String({ format: "uuid" }),
    competitionRoundId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    ),
    scheduledAt: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    roomProgramId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    ),
    matchRulesOverride: t.Optional(
      t.Union([t.Record(t.String(), t.Unknown()), t.Null()])
    )
  })
]);

export const scheduleChampionshipMatchBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedMatchRevision: t.Integer({ minimum: 0 }),
    competitionRoundId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    ),
    scheduledAt: t.Union([t.String({ format: "date-time" }), t.Null()]),
    scheduleStatus: t.Union([
      t.Literal("unscheduled"),
      t.Literal("scheduled"),
      t.Literal("late-authorized"),
      t.Literal("canceled")
    ]),
    roomProgramId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()]))
  })
]);

export const championshipMatchSchedulingQuerySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 200, default: 100 }))
});

export const createChampionshipScheduleProposalBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedMatchScheduleRevision: t.Integer({ minimum: 0 }),
    parentProposalId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    ),
    expectedParentProposalRevision: t.Optional(
      t.Union([t.Integer({ minimum: 0 }), t.Null()])
    ),
    mode: t.Union([t.Literal("exact-time"), t.Literal("availability-range")]),
    exactTime: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    availableFrom: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    availableTo: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    note: t.Optional(t.Union([t.String({ maxLength: 1_000 }), t.Null()]))
  })
]);

export const decideChampionshipScheduleProposalBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedMatchScheduleRevision: t.Integer({ minimum: 0 }),
    expectedProposalRevision: t.Integer({ minimum: 0 }),
    decision: t.Union([
      t.Literal("accept"),
      t.Literal("reject"),
      t.Literal("withdraw")
    ]),
    scheduledAt: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    reason: t.Optional(t.Union([t.String({ maxLength: 1_000 }), t.Null()]))
  })
]);

export const authorizeChampionshipLatePlayBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedMatchScheduleRevision: t.Integer({ minimum: 0 }),
    reason: t.String({ minLength: 1, maxLength: 1_000 }),
    expiresAt: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    )
  })
]);

export const revokeChampionshipLatePlayBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    expectedAuthorizationRevision: t.Integer({ minimum: 0 }),
    reason: t.String({ minLength: 1, maxLength: 1_000 })
  })
]);

export const remindChampionshipScheduleBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    note: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()]))
  })
]);

export const createChampionshipBodySchema = t.Composite([
  championshipCreateCommandSchema,
  t.Object({
    competitionTypeId: t.String({ format: "uuid" }),
    slug: championshipSlugSchema,
    name: t.String({ minLength: 1, maxLength: 160 }),
    editionLabel: t.Optional(t.Union([t.String({ maxLength: 80 }), t.Null()])),
    description: t.Optional(
      t.Union([t.String({ maxLength: 4_000 }), t.Null()])
    ),
    historical: t.Optional(t.Boolean()),
    createCompleted: t.Optional(t.Boolean()),
    startsAt: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    endsAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
    roomProgramIds: t.Optional(
      t.Array(t.String({ format: "uuid" }), { uniqueItems: true })
    ),
    defaultRoomProgramId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    )
  })
]);

export const updateChampionshipBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    name: t.Optional(t.String({ minLength: 1, maxLength: 160 })),
    editionLabel: t.Optional(t.Union([t.String({ maxLength: 80 }), t.Null()])),
    description: t.Optional(
      t.Union([t.String({ maxLength: 4_000 }), t.Null()])
    ),
    startsAt: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Null()])
    ),
    endsAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
    rules: t.Optional(championshipRulesV1Schema),
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const transitionChampionshipBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    transition: t.Union([
      t.Literal("publish"),
      t.Literal("unpublish"),
      t.Literal("activate"),
      t.Literal("complete"),
      t.Literal("archive"),
      t.Literal("cancel"),
      t.Literal("delete")
    ]),
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const createTeamIdentityBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    slug: championshipSlugSchema,
    name: t.String({ minLength: 1, maxLength: 120 }),
    abbreviation: t.Optional(
      t.Union([t.String({ minLength: 1, maxLength: 12 }), t.Null()])
    ),
    colors: t.Optional(
      t.Union([
        t.Array(t.String({ pattern: "^#[0-9a-fA-F]{6}$" }), {
          minItems: 1,
          maxItems: 4
        }),
        t.Null()
      ])
    ),
    branding: t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()]))
  })
]);

export const updateTeamIdentityBodySchema = t.Composite([
  championshipCommandSchema,
  t.Partial(
    t.Object({
      name: t.String({ minLength: 1, maxLength: 120 }),
      abbreviation: t.Union([
        t.String({ minLength: 1, maxLength: 12 }),
        t.Null()
      ]),
      colors: t.Union([
        t.Array(t.String({ pattern: "^#[0-9a-fA-F]{6}$" }), {
          minItems: 1,
          maxItems: 4
        }),
        t.Null()
      ]),
      branding: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
      state: t.Union([t.Literal("active"), t.Literal("archived")])
    })
  )
]);

export const createChampionshipTeamBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    teamIdentityId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    ),
    name: t.String({ minLength: 1, maxLength: 120 }),
    abbreviation: t.Optional(
      t.Union([t.String({ minLength: 1, maxLength: 12 }), t.Null()])
    ),
    colors: t.Optional(
      t.Union([
        t.Array(t.String({ pattern: "^#[0-9a-fA-F]{6}$" }), {
          minItems: 1,
          maxItems: 4
        }),
        t.Null()
      ])
    ),
    seed: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
    displayOrder: t.Optional(t.Integer({ minimum: 0 }))
  })
]);

export const updateChampionshipTeamBodySchema = t.Composite([
  championshipCommandSchema,
  t.Partial(
    t.Object({
      teamIdentityId: t.Union([t.String({ format: "uuid" }), t.Null()]),
      name: t.String({ minLength: 1, maxLength: 120 }),
      abbreviation: t.Union([
        t.String({ minLength: 1, maxLength: 12 }),
        t.Null()
      ]),
      colors: t.Union([
        t.Array(t.String({ pattern: "^#[0-9a-fA-F]{6}$" }), {
          minItems: 1,
          maxItems: 4
        }),
        t.Null()
      ]),
      seed: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
      displayOrder: t.Integer({ minimum: 0 }),
      state: t.Union([
        t.Literal("active"),
        t.Literal("withdrawn"),
        t.Literal("disqualified")
      ])
    })
  )
]);

export const updateChampionshipRoomProgramBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    roomProgramId: t.String({ format: "uuid" }),
    operation: t.Union([
      t.Literal("add"),
      t.Literal("set-default"),
      t.Literal("retire"),
      t.Literal("reactivate")
    ]),
    replacementRoomProgramId: t.Optional(
      t.Union([t.String({ format: "uuid" }), t.Null()])
    )
  })
]);

export const updateChampionshipGrantBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    accountUuid: t.String({ format: "uuid" }),
    permission: t.Union([
      t.Literal("championship:admin"),
      t.Literal("championship:operate"),
      t.Literal("championship-history:admin")
    ]),
    operation: t.Union([t.Literal("grant"), t.Literal("revoke")])
  })
]);

export const listChampionshipAuditQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" }),
    afterSequence: t.Optional(t.Integer({ minimum: 0 })),
    filterActorAccountUuid: t.Optional(t.String({ format: "uuid" })),
    action: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
    targetType: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
    targetUuid: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
    correlationUuid: t.Optional(t.String({ format: "uuid" }))
  })
]);

export const championshipEventsQuerySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  afterSequence: t.Optional(t.Integer({ minimum: 0 }))
});

export const championshipCollaborationQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" }),
    contextType: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
    contextUuid: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
    state: t.Optional(t.Union([t.Literal("open"), t.Literal("resolved")]))
  })
]);

export const createChampionshipThreadBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    contextType: t.String({ minLength: 1, maxLength: 80 }),
    contextUuid: t.Optional(
      t.Union([t.String({ minLength: 1, maxLength: 120 }), t.Null()])
    ),
    title: t.Optional(
      t.Union([t.String({ minLength: 1, maxLength: 160 }), t.Null()])
    ),
    body: t.String({ minLength: 1, maxLength: 10_000 }),
    mentionAccountUuids: t.Optional(
      t.Array(t.String({ format: "uuid" }), {
        uniqueItems: true,
        maxItems: 50
      })
    )
  })
]);

export const addChampionshipCommentBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    body: t.String({ minLength: 1, maxLength: 10_000 }),
    mentionAccountUuids: t.Optional(
      t.Array(t.String({ format: "uuid" }), {
        uniqueItems: true,
        maxItems: 50
      })
    )
  })
]);

export const updateChampionshipThreadBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    state: t.Union([t.Literal("open"), t.Literal("resolved")])
  })
]);

export const createChampionshipAssignmentBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    contextType: t.String({ minLength: 1, maxLength: 80 }),
    contextUuid: t.Optional(
      t.Union([t.String({ minLength: 1, maxLength: 120 }), t.Null()])
    ),
    title: t.String({ minLength: 1, maxLength: 200 }),
    description: t.Optional(
      t.Union([t.String({ maxLength: 4_000 }), t.Null()])
    ),
    assigneeAccountUuid: t.String({ format: "uuid" }),
    dueAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()]))
  })
]);

export const updateChampionshipAssignmentBodySchema = t.Composite([
  championshipCommandSchema,
  t.Object({
    state: t.Union([
      t.Literal("open"),
      t.Literal("in-progress"),
      t.Literal("completed"),
      t.Literal("canceled")
    ]),
    reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 }))
  })
]);

export const championshipPresenceBodySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  sessionUuid: t.String({ format: "uuid" }),
  contextType: t.Optional(
    t.Union([t.String({ minLength: 1, maxLength: 80 }), t.Null()])
  ),
  contextUuid: t.Optional(
    t.Union([t.String({ minLength: 1, maxLength: 120 }), t.Null()])
  )
});

export const championshipPresenceQuerySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" })
});

export const championshipInboxQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" }),
    unreadOnly: t.Optional(t.Boolean())
  })
]);

export const championshipInboxItemIdParamsSchema = t.Object({
  inboxItemId: t.String({ format: "uuid" })
});

export const updateChampionshipInboxItemBodySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  operation: t.Union([
    t.Literal("read"),
    t.Literal("unread"),
    t.Literal("archive")
  ])
});

export const championshipSavedViewsQuerySchema = t.Composite([
  paginationQuerySchema,
  t.Object({
    actorAccountUuid: t.String({ format: "uuid" }),
    surface: t.Optional(t.String({ minLength: 1, maxLength: 80 }))
  })
]);

export const upsertChampionshipSavedViewBodySchema = t.Object({
  actorAccountUuid: t.String({ format: "uuid" }),
  surface: t.String({ minLength: 1, maxLength: 80 }),
  name: t.String({ minLength: 1, maxLength: 120 }),
  state: t.Record(t.String(), t.Unknown()),
  isDefault: t.Optional(t.Boolean())
});

export type CreateCompetitionTypeInput = Static<
  typeof createCompetitionTypeBodySchema
>;
export type UpdateCompetitionTypeInput = Static<
  typeof updateCompetitionTypeBodySchema
>;
export type ListCompetitionTypesQuery = Static<
  typeof listCompetitionTypesQuerySchema
>;
export type CreateChampionshipInput = Static<
  typeof createChampionshipBodySchema
>;
export type UpdateChampionshipInput = Static<
  typeof updateChampionshipBodySchema
>;
export type TransitionChampionshipInput = Static<
  typeof transitionChampionshipBodySchema
>;
export type ListChampionshipsQuery = Static<
  typeof listChampionshipsQuerySchema
>;
export type ListChampionshipParticipantsQuery = Static<
  typeof listChampionshipParticipantsQuerySchema
>;
export type TransitionChampionshipRegistrationInput = Static<
  typeof transitionChampionshipRegistrationBodySchema
>;
export type SelfRegisterChampionshipInput = Static<
  typeof selfRegisterChampionshipBodySchema
>;
export type WithdrawChampionshipRegistrationInput = Static<
  typeof withdrawChampionshipRegistrationBodySchema
>;
export type CreateChampionshipParticipantInput = Static<
  typeof createChampionshipParticipantBodySchema
>;
export type UpdateChampionshipParticipantInput = Static<
  typeof updateChampionshipParticipantBodySchema
>;
export type UpsertChampionshipPricesInput = Static<
  typeof upsertChampionshipPricesBodySchema
>;
export type FreezeChampionshipPricesInput = Static<
  typeof freezeChampionshipPricesBodySchema
>;
export type ChampionshipSalaryQuery = Static<
  typeof championshipSalaryQuerySchema
>;
export type ChampionshipSalaryAdminQuery = Static<
  typeof championshipSalaryAdminQuerySchema
>;
export type ChampionshipRosterHistoryQuery = Static<
  typeof championshipRosterHistoryQuerySchema
>;
export type PreviewChampionshipRosterMoveInput = Static<
  typeof previewChampionshipRosterMoveBodySchema
>;
export type ExecuteChampionshipRosterMoveInput = Static<
  typeof executeChampionshipRosterMoveBodySchema
>;
export type ReorderChampionshipRosterInput = Static<
  typeof reorderChampionshipRosterBodySchema
>;
export type ChampionshipDraftQuery = Static<
  typeof championshipDraftQuerySchema
>;
export type ConfigureChampionshipDraftInput = Static<
  typeof configureChampionshipDraftBodySchema
>;
export type StartChampionshipDraftInput = Static<
  typeof startChampionshipDraftBodySchema
>;
export type MakeChampionshipDraftPickInput = Static<
  typeof makeChampionshipDraftPickBodySchema
>;
export type EndChampionshipDraftInput = Static<
  typeof endChampionshipDraftBodySchema
>;
export type VoidChampionshipDraftPickInput = Static<
  typeof voidChampionshipDraftPickBodySchema
>;
export type ListChampionshipTradesQuery = Static<
  typeof listChampionshipTradesQuerySchema
>;
export type CreateChampionshipTradeInput = Static<
  typeof createChampionshipTradeBodySchema
>;
export type DecideChampionshipTradeInput = Static<
  typeof decideChampionshipTradeBodySchema
>;
export type ChampionshipFormatQuery = Static<
  typeof championshipFormatQuerySchema
>;
export type CreateChampionshipStageInput = Static<
  typeof createChampionshipStageBodySchema
>;
export type UpdateChampionshipStageInput = Static<
  typeof updateChampionshipStageBodySchema
>;
export type CreateChampionshipGroupInput = Static<
  typeof createChampionshipGroupBodySchema
>;
export type ConfigureChampionshipStandingsInput = Static<
  typeof configureChampionshipStandingsBodySchema
>;
export type ChampionshipStandingsQuery = Static<
  typeof championshipStandingsQuerySchema
>;
export type PreviewChampionshipRoundRobinInput = Static<
  typeof previewChampionshipRoundRobinBodySchema
>;
export type GenerateChampionshipRoundRobinInput = Static<
  typeof generateChampionshipRoundRobinBodySchema
>;
export type PreviewChampionshipClassificationInput = Static<
  typeof previewChampionshipClassificationBodySchema
>;
export type ApplyChampionshipClassificationInput = Static<
  typeof applyChampionshipClassificationBodySchema
>;
export type GenerateSingleEliminationInput = Static<
  typeof generateSingleEliminationBodySchema
>;
export type PreviewDoubleEliminationInput = Static<
  typeof previewDoubleEliminationBodySchema
>;
export type GenerateDoubleEliminationInput = Static<
  typeof generateDoubleEliminationBodySchema
>;
export type CreateChampionshipSpotInput = Static<
  typeof createChampionshipSpotBodySchema
>;
export type PlaceChampionshipSpotInput = Static<
  typeof placeChampionshipSpotBodySchema
>;
export type PreviewChampionshipSpotPlacementInput = Static<
  typeof previewChampionshipSpotPlacementBodySchema
>;
export type CreateChampionshipRouteInput = Static<
  typeof createChampionshipRouteBodySchema
>;
export type UpdateChampionshipRouteInput = Static<
  typeof updateChampionshipRouteBodySchema
>;
export type CreateChampionshipCompetitionRoundInput = Static<
  typeof createChampionshipCompetitionRoundBodySchema
>;
export type CreateChampionshipMatchInput = Static<
  typeof createChampionshipMatchBodySchema
>;
export type ScheduleChampionshipMatchInput = Static<
  typeof scheduleChampionshipMatchBodySchema
>;
export type ChampionshipMatchSchedulingQuery = Static<
  typeof championshipMatchSchedulingQuerySchema
>;
export type CreateChampionshipScheduleProposalInput = Static<
  typeof createChampionshipScheduleProposalBodySchema
>;
export type DecideChampionshipScheduleProposalInput = Static<
  typeof decideChampionshipScheduleProposalBodySchema
>;
export type AuthorizeChampionshipLatePlayInput = Static<
  typeof authorizeChampionshipLatePlayBodySchema
>;
export type RevokeChampionshipLatePlayInput = Static<
  typeof revokeChampionshipLatePlayBodySchema
>;
export type RemindChampionshipScheduleInput = Static<
  typeof remindChampionshipScheduleBodySchema
>;
export type CreateTeamIdentityInput = Static<
  typeof createTeamIdentityBodySchema
>;
export type UpdateTeamIdentityInput = Static<
  typeof updateTeamIdentityBodySchema
>;
export type CreateChampionshipTeamInput = Static<
  typeof createChampionshipTeamBodySchema
>;
export type UpdateChampionshipTeamInput = Static<
  typeof updateChampionshipTeamBodySchema
>;
export type UpdateChampionshipRoomProgramInput = Static<
  typeof updateChampionshipRoomProgramBodySchema
>;
export type UpdateChampionshipGrantInput = Static<
  typeof updateChampionshipGrantBodySchema
>;
export type ListChampionshipAuditQuery = Static<
  typeof listChampionshipAuditQuerySchema
>;
export type ChampionshipCollaborationQuery = Static<
  typeof championshipCollaborationQuerySchema
>;
export type CreateChampionshipThreadInput = Static<
  typeof createChampionshipThreadBodySchema
>;
export type AddChampionshipCommentInput = Static<
  typeof addChampionshipCommentBodySchema
>;
export type UpdateChampionshipThreadInput = Static<
  typeof updateChampionshipThreadBodySchema
>;
export type CreateChampionshipAssignmentInput = Static<
  typeof createChampionshipAssignmentBodySchema
>;
export type UpdateChampionshipAssignmentInput = Static<
  typeof updateChampionshipAssignmentBodySchema
>;
export type ChampionshipPresenceInput = Static<
  typeof championshipPresenceBodySchema
>;
export type ChampionshipInboxQuery = Static<
  typeof championshipInboxQuerySchema
>;
export type UpdateChampionshipInboxItemInput = Static<
  typeof updateChampionshipInboxItemBodySchema
>;
export type ChampionshipSavedViewsQuery = Static<
  typeof championshipSavedViewsQuerySchema
>;
export type UpsertChampionshipSavedViewInput = Static<
  typeof upsertChampionshipSavedViewBodySchema
>;
