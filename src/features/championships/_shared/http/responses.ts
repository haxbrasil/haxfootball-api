import { type Static, t } from "elysia";
import { championshipRulesV1Schema } from "@/features/championships/core/rules";
import { paginatedResponseSchema } from "@lib";

export const championshipCompetitionTypeResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  slug: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  cadence: t.Nullable(
    t.Union([
      t.Literal("long-running"),
      t.Literal("multi-day"),
      t.Literal("single-event")
    ])
  ),
  defaultRulesSchemaVersion: t.Integer(),
  defaultRules: championshipRulesV1Schema,
  state: t.Union([t.Literal("active"), t.Literal("archived")]),
  revision: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipTeamIdentityResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  slug: t.String(),
  name: t.String(),
  abbreviation: t.Nullable(t.String()),
  colors: t.Nullable(t.Array(t.String())),
  branding: t.Nullable(t.Record(t.String(), t.Unknown())),
  archivedAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipTeamResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  teamIdentity: t.Nullable(championshipTeamIdentityResponseSchema),
  name: t.String(),
  abbreviation: t.Nullable(t.String()),
  colors: t.Nullable(t.Array(t.String())),
  brandingSnapshot: t.Nullable(t.Record(t.String(), t.Unknown())),
  seed: t.Nullable(t.Integer()),
  displayOrder: t.Integer(),
  state: t.Union([
    t.Literal("active"),
    t.Literal("withdrawn"),
    t.Literal("disqualified")
  ]),
  rosterRevision: t.Integer(),
  revision: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipParticipantResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  identity: t.Union([
    t.Object({
      kind: t.Literal("account"),
      accountUuid: t.String({ format: "uuid" }),
      name: t.String()
    }),
    t.Object({
      kind: t.Literal("historical"),
      historicalIdentityUuid: t.String({ format: "uuid" }),
      displayName: t.String(),
      aliases: t.Nullable(t.Array(t.String())),
      linkedAccount: t.Nullable(
        t.Object({
          accountUuid: t.String({ format: "uuid" }),
          name: t.String()
        })
      )
    })
  ]),
  displayName: t.String(),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("active"),
    t.Literal("withdrawn"),
    t.Literal("ineligible"),
    t.Literal("removed")
  ]),
  origin: t.Union([
    t.Literal("self"),
    t.Literal("staff"),
    t.Literal("historical-import")
  ]),
  activeMembership: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      team: t.Object({
        uuid: t.String({ format: "uuid" }),
        name: t.String()
      }),
      role: t.Union([t.Literal("gm"), t.Literal("player")]),
      acquisitionSource: t.Union([
        t.Literal("staff"),
        t.Literal("draft"),
        t.Literal("trade"),
        t.Literal("replacement"),
        t.Literal("historical-import")
      ]),
      priceUnitsSnapshot: t.Nullable(t.Integer()),
      startedAt: t.String()
    })
  ),
  registeredAt: t.Nullable(t.String()),
  registrationClosedAt: t.Nullable(t.String()),
  withdrawnAt: t.Nullable(t.String()),
  revision: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipSelfRegistrationResponseSchema = t.Object({
  participant: t.Nullable(championshipParticipantResponseSchema)
});

export const championshipRosterMembershipResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  participant: t.Object({
    uuid: t.String({ format: "uuid" }),
    displayName: t.String()
  }),
  team: t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  role: t.Union([t.Literal("gm"), t.Literal("player")]),
  acquisitionSource: t.Union([
    t.Literal("staff"),
    t.Literal("draft"),
    t.Literal("trade"),
    t.Literal("replacement"),
    t.Literal("historical-import")
  ]),
  acquisitionReferenceUuid: t.Nullable(t.String()),
  priceUnitsSnapshot: t.Nullable(t.Integer()),
  displayOrder: t.Integer(),
  effectiveFromRevision: t.Integer(),
  effectiveToRevision: t.Nullable(t.Integer()),
  startedAt: t.String(),
  endedAt: t.Nullable(t.String())
});

export const championshipSalaryParticipantResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  displayName: t.String(),
  status: t.Union([
    t.Literal("pending"),
    t.Literal("active"),
    t.Literal("withdrawn"),
    t.Literal("ineligible"),
    t.Literal("removed")
  ]),
  priceUnits: t.Nullable(t.Integer()),
  frozenAt: t.Nullable(t.String()),
  membership: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      teamUuid: t.String({ format: "uuid" }),
      teamName: t.String(),
      role: t.Union([t.Literal("gm"), t.Literal("player")]),
      displayOrder: t.Integer(),
      priceUnitsSnapshot: t.Nullable(t.Integer())
    })
  )
});

export const championshipSalaryTeamResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  abbreviation: t.Nullable(t.String()),
  colors: t.Nullable(t.Array(t.String())),
  rosterRevision: t.Integer(),
  rosterSize: t.Integer(),
  usageUnits: t.Integer(),
  remainingUnits: t.Integer(),
  overCap: t.Boolean(),
  approvedOverCap: t.Boolean(),
  activeException: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      usageUnitsSnapshot: t.Integer(),
      rosterRevisionSnapshot: t.Integer(),
      expiresAtRevision: t.Integer(),
      approvedAt: t.String(),
      reason: t.Nullable(t.String())
    })
  )
});

export const championshipSalaryProjectionResponseSchema = t.Object({
  championshipUuid: t.String({ format: "uuid" }),
  enabled: t.Boolean(),
  priceState: t.Union([
    t.Literal("disabled"),
    t.Literal("editable"),
    t.Literal("locked")
  ]),
  capUnits: t.Integer(),
  displayLabel: t.String(),
  visibility: t.Union([t.Literal("public"), t.Literal("admin")]),
  validation: t.Object({
    missingPriceCount: t.Integer(),
    missingParticipantIds: t.Array(t.String({ format: "uuid" })),
    canFreeze: t.Boolean()
  }),
  participants: paginatedResponseSchema(
    championshipSalaryParticipantResponseSchema
  ),
  teams: paginatedResponseSchema(championshipSalaryTeamResponseSchema)
});

export const championshipRosterMovePreviewResponseSchema = t.Object({
  participant: t.Object({
    uuid: t.String({ format: "uuid" }),
    displayName: t.String(),
    priceUnits: t.Nullable(t.Integer())
  }),
  source: t.Nullable(
    t.Object({
      teamUuid: t.String({ format: "uuid" }),
      teamName: t.String(),
      role: t.Union([t.Literal("gm"), t.Literal("player")])
    })
  ),
  target: t.Nullable(
    t.Object({
      teamUuid: t.String({ format: "uuid" }),
      teamName: t.String(),
      role: t.Union([t.Literal("gm"), t.Literal("player")])
    })
  ),
  valid: t.Boolean(),
  requiresCapException: t.Boolean(),
  violations: t.Array(t.String()),
  affectedTeams: t.Array(
    t.Object({
      teamUuid: t.String({ format: "uuid" }),
      teamName: t.String(),
      rosterRevision: t.Integer(),
      usageBeforeUnits: t.Integer(),
      usageAfterUnits: t.Integer(),
      remainingAfterUnits: t.Integer(),
      rosterSizeBefore: t.Integer(),
      rosterSizeAfter: t.Integer(),
      overCapAfter: t.Boolean()
    })
  )
});

export const championshipRosterOrderResponseSchema = t.Object({
  teamUuid: t.String({ format: "uuid" }),
  rosterRevision: t.Integer(),
  participantIds: t.Array(t.String({ format: "uuid" }))
});

const championshipDraftTeamResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  abbreviation: t.Nullable(t.String()),
  colors: t.Nullable(t.Array(t.String())),
  position: t.Integer(),
  rosterRevision: t.Integer(),
  rosterSize: t.Integer(),
  usageUnits: t.Integer(),
  remainingUnits: t.Integer(),
  overCap: t.Boolean(),
  roster: t.Array(
    t.Object({
      participantUuid: t.String({ format: "uuid" }),
      displayName: t.String(),
      role: t.Union([t.Literal("gm"), t.Literal("player")]),
      priceUnits: t.Nullable(t.Integer())
    })
  )
});

const championshipDraftTurnResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  sequence: t.Integer(),
  round: t.Integer(),
  position: t.Integer(),
  team: t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  state: t.Union([
    t.Literal("pending"),
    t.Literal("open"),
    t.Literal("overdue"),
    t.Literal("filled"),
    t.Literal("voided")
  ]),
  selectedParticipant: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      displayName: t.String()
    })
  ),
  priceUnitsSnapshot: t.Nullable(t.Integer()),
  openedAt: t.Nullable(t.String()),
  deadlineAt: t.Nullable(t.String()),
  overdueAt: t.Nullable(t.String()),
  filledAt: t.Nullable(t.String()),
  recordedResolution: t.Nullable(
    t.Union([
      t.Literal("selected"),
      t.Literal("unresolved"),
      t.Literal("skipped")
    ])
  ),
  occurredAt: t.Nullable(t.String()),
  revision: t.Integer()
});

const championshipDraftAvailableParticipantResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  displayName: t.String(),
  priceUnits: t.Nullable(t.Integer())
});

export const championshipDraftResponseSchema = t.Object({
  draft: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      state: t.Union([
        t.Literal("setup"),
        t.Literal("live"),
        t.Literal("completed"),
        t.Literal("canceled")
      ]),
      mode: t.Union([t.Literal("live"), t.Literal("recorded")]),
      rounds: t.Integer(),
      countdownSeconds: t.Integer(),
      nextTurnSequence: t.Integer(),
      revision: t.Integer(),
      championshipRevision: t.Integer(),
      serverTime: t.String(),
      startedAt: t.Nullable(t.String()),
      completedAt: t.Nullable(t.String()),
      canceledAt: t.Nullable(t.String()),
      occurredAt: t.Nullable(t.String()),
      recordedAt: t.Nullable(t.String()),
      createdAt: t.String(),
      updatedAt: t.String(),
      teams: t.Array(championshipDraftTeamResponseSchema, { maxItems: 64 }),
      turns: paginatedResponseSchema(championshipDraftTurnResponseSchema),
      availableParticipants: paginatedResponseSchema(
        championshipDraftAvailableParticipantResponseSchema
      ),
      actor: t.Object({
        canManage: t.Boolean(),
        gmTeamIds: t.Array(t.String({ format: "uuid" })),
        eligibleTurnIds: t.Array(t.String({ format: "uuid" }))
      })
    })
  )
});

const championshipRecordedDraftIssueResponseSchema = t.Object({
  code: t.String(),
  severity: t.Union([t.Literal("error"), t.Literal("warning")]),
  message: t.String(),
  sequence: t.Nullable(t.Integer()),
  participantUuid: t.Nullable(t.String({ format: "uuid" }))
});

const championshipRecordedDraftPreviewSlotResponseSchema = t.Object({
  sequence: t.Integer(),
  round: t.Integer(),
  position: t.Integer(),
  team: t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  resolution: t.Union([
    t.Literal("selected"),
    t.Literal("unresolved"),
    t.Literal("skipped")
  ]),
  participant: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      displayName: t.String()
    })
  ),
  priceUnitsSnapshot: t.Nullable(t.Integer()),
  existingTeam: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      name: t.String()
    })
  )
});

const championshipRecordedDraftTeamPreviewResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  selectedCount: t.Integer(),
  usageBeforeUnits: t.Integer(),
  usageAfterUnits: t.Integer(),
  remainingAfterUnits: t.Integer(),
  overCapAfter: t.Boolean()
});

export const championshipRecordedDraftPreviewResponseSchema = t.Object({
  valid: t.Boolean(),
  previewHash: t.String(),
  currentChampionshipRevision: t.Integer(),
  rounds: t.Integer(),
  requiresCapException: t.Boolean(),
  selectedCount: t.Integer(),
  unresolvedCount: t.Integer(),
  skippedCount: t.Integer(),
  issues: t.Array(championshipRecordedDraftIssueResponseSchema),
  slots: t.Array(championshipRecordedDraftPreviewSlotResponseSchema, {
    maxItems: 6_400
  }),
  teams: t.Array(championshipRecordedDraftTeamPreviewResponseSchema, {
    maxItems: 64
  })
});

export const championshipDraftCorrectionPreviewResponseSchema = t.Object({
  turnUuid: t.String({ format: "uuid" }),
  canReverse: t.Boolean(),
  reasons: t.Array(t.String()),
  participant: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      displayName: t.String(),
      priceUnits: t.Nullable(t.Integer())
    })
  ),
  team: t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String(),
    rosterRevision: t.Integer(),
    usageAfterUnits: t.Integer(),
    remainingAfterUnits: t.Integer()
  }),
  reopenedState: t.Union([t.Literal("open"), t.Literal("overdue")])
});

const championshipTradeItemResponseSchema = t.Object({
  participant: t.Object({
    uuid: t.String({ format: "uuid" }),
    displayName: t.String()
  }),
  fromTeamUuid: t.String({ format: "uuid" }),
  toTeamUuid: t.String({ format: "uuid" }),
  frozenPriceUnits: t.Integer()
});

export const championshipTradeResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  state: t.Union([
    t.Literal("proposed"),
    t.Literal("accepted"),
    t.Literal("rejected"),
    t.Literal("canceled"),
    t.Literal("expired")
  ]),
  proposingTeam: t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  receivingTeam: t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  proposingValueUnits: t.Integer(),
  receivingValueUnits: t.Integer(),
  valueDifferenceUnits: t.Integer(),
  maximumDifferenceUnitsSnapshot: t.Integer(),
  items: t.Array(championshipTradeItemResponseSchema, { maxItems: 40 }),
  proposer: t.Object({
    accountUuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  decidedBy: t.Nullable(
    t.Object({
      accountUuid: t.String({ format: "uuid" }),
      name: t.String()
    })
  ),
  proposedAt: t.String(),
  deadlineAt: t.Nullable(t.String()),
  decidedAt: t.Nullable(t.String()),
  revision: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String(),
  actorActions: t.Object({
    canAccept: t.Boolean(),
    canReject: t.Boolean(),
    canCancel: t.Boolean()
  })
});

export const listChampionshipTradesResponseSchema = paginatedResponseSchema(
  championshipTradeResponseSchema
);

export const championshipRoomProgramResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  title: t.Nullable(t.String()),
  state: t.Union([t.Literal("active"), t.Literal("retired")]),
  isDefault: t.Boolean()
});

export const championshipGrantResponseSchema = t.Object({
  accountUuid: t.String({ format: "uuid" }),
  accountName: t.String(),
  permission: t.String(),
  createdAt: t.String()
});

export const championshipSummaryResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  slug: t.String(),
  competitionType: championshipCompetitionTypeResponseSchema,
  name: t.String(),
  editionLabel: t.Nullable(t.String()),
  description: t.Nullable(t.String()),
  lifecycle: t.Union([
    t.Literal("setup"),
    t.Literal("active"),
    t.Literal("completed"),
    t.Literal("archived"),
    t.Literal("canceled")
  ]),
  visibility: t.Union([t.Literal("private"), t.Literal("public")]),
  registrationState: t.Union([
    t.Literal("not-open"),
    t.Literal("open"),
    t.Literal("closed")
  ]),
  priceState: t.Union([
    t.Literal("disabled"),
    t.Literal("editable"),
    t.Literal("locked")
  ]),
  tradeWindowState: t.Union([t.Literal("open"), t.Literal("closed")]),
  historical: t.Boolean(),
  revision: t.Integer(),
  changeSequence: t.Integer(),
  startsAt: t.Nullable(t.String()),
  endsAt: t.Nullable(t.String()),
  publishedAt: t.Nullable(t.String()),
  completedAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipDetailResponseSchema = t.Composite([
  championshipSummaryResponseSchema,
  t.Object({
    rulesSchemaVersion: t.Integer(),
    rules: championshipRulesV1Schema,
    teams: t.Array(championshipTeamResponseSchema),
    roomPrograms: t.Array(championshipRoomProgramResponseSchema),
    grants: t.Array(championshipGrantResponseSchema)
  })
]);

export const championshipAuditEventResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  sequence: t.Integer(),
  correlationUuid: t.String({ format: "uuid" }),
  commandUuid: t.Nullable(t.String()),
  actor: t.Object({
    kind: t.String(),
    accountUuid: t.Nullable(t.String()),
    accountName: t.Nullable(t.String())
  }),
  action: t.String(),
  source: t.String(),
  targetType: t.String(),
  targetUuid: t.Nullable(t.String()),
  before: t.Unknown(),
  after: t.Unknown(),
  reason: t.Nullable(t.String()),
  metadata: t.Unknown(),
  createdAt: t.String()
});

export const championshipCommentResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  threadUuid: t.String({ format: "uuid" }),
  author: t.Object({
    accountUuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  body: t.String(),
  mentions: t.Array(
    t.Object({
      accountUuid: t.String({ format: "uuid" }),
      name: t.String()
    })
  ),
  revision: t.Integer(),
  editedAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipThreadResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  contextType: t.String(),
  contextUuid: t.Nullable(t.String()),
  title: t.Nullable(t.String()),
  state: t.Union([t.Literal("open"), t.Literal("resolved")]),
  createdBy: t.Object({
    accountUuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  resolvedBy: t.Nullable(
    t.Object({
      accountUuid: t.String({ format: "uuid" }),
      name: t.String()
    })
  ),
  resolvedAt: t.Nullable(t.String()),
  revision: t.Integer(),
  commentCount: t.Integer(),
  latestComment: t.Nullable(championshipCommentResponseSchema),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipAssignmentResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  contextType: t.String(),
  contextUuid: t.Nullable(t.String()),
  title: t.String(),
  description: t.Nullable(t.String()),
  assignee: t.Object({
    accountUuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  assignedBy: t.Object({
    accountUuid: t.String({ format: "uuid" }),
    name: t.String()
  }),
  state: t.Union([
    t.Literal("open"),
    t.Literal("in-progress"),
    t.Literal("completed"),
    t.Literal("canceled")
  ]),
  dueAt: t.Nullable(t.String()),
  completedAt: t.Nullable(t.String()),
  revision: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipPresenceResponseSchema = t.Object({
  accountUuid: t.String({ format: "uuid" }),
  name: t.String(),
  sessionUuid: t.String({ format: "uuid" }),
  contextType: t.Nullable(t.String()),
  contextUuid: t.Nullable(t.String()),
  expiresAt: t.String()
});

export const championshipInboxItemResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  championshipUuid: t.String({ format: "uuid" }),
  championshipName: t.String(),
  kind: t.String(),
  title: t.String(),
  body: t.Nullable(t.String()),
  contextType: t.Nullable(t.String()),
  contextUuid: t.Nullable(t.String()),
  readAt: t.Nullable(t.String()),
  createdAt: t.String()
});

export const championshipSavedViewResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  surface: t.String(),
  name: t.String(),
  state: t.Record(t.String(), t.Unknown()),
  isDefault: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String()
});

const championshipFormatTeamReferenceSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  abbreviation: t.Nullable(t.String()),
  colors: t.Nullable(t.Array(t.String()))
});

const championshipFormatRoomProgramReferenceSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String()
});

export const championshipStageResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  displayOrder: t.Integer(),
  engine: t.Union([
    t.Literal("manual"),
    t.Literal("single-elimination"),
    t.Literal("double-elimination"),
    t.Literal("standings")
  ]),
  state: t.Union([
    t.Literal("draft"),
    t.Literal("active"),
    t.Literal("completed")
  ]),
  configSchemaVersion: t.Integer(),
  config: t.Record(t.String(), t.Unknown()),
  defaultRoomProgram: t.Nullable(championshipFormatRoomProgramReferenceSchema),
  revision: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipGroupResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  stageUuid: t.String({ format: "uuid" }),
  name: t.String(),
  displayOrder: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipSpotResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  stageUuid: t.String({ format: "uuid" }),
  groupUuid: t.Nullable(t.String({ format: "uuid" })),
  key: t.String(),
  label: t.String(),
  kind: t.Union([
    t.Literal("seed"),
    t.Literal("group-entry"),
    t.Literal("match-side"),
    t.Literal("qualification"),
    t.Literal("placement"),
    t.Literal("manual")
  ]),
  displayOrder: t.Integer(),
  placementRank: t.Nullable(t.Integer({ minimum: 1 })),
  currentTeam: t.Nullable(championshipFormatTeamReferenceSchema),
  x: t.Nullable(t.Integer()),
  y: t.Nullable(t.Integer()),
  revision: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipCompetitionRoundResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  stageUuid: t.Nullable(t.String({ format: "uuid" })),
  name: t.String(),
  sequence: t.Integer(),
  startsAt: t.Nullable(t.String()),
  endsAt: t.Nullable(t.String()),
  schedulingAuthority: t.Nullable(
    t.Union([t.Literal("staff"), t.Literal("gms"), t.Literal("staff-and-gms")])
  ),
  latePlayPolicy: t.Nullable(
    t.Union([
      t.Literal("forbidden"),
      t.Literal("staff-approval"),
      t.Literal("allowed")
    ])
  ),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipFormatMatchResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  stageUuid: t.String({ format: "uuid" }),
  groupUuid: t.Nullable(t.String({ format: "uuid" })),
  label: t.String(),
  displayOrder: t.Integer(),
  sideA: t.Object({
    spotUuid: t.String({ format: "uuid" }),
    team: t.Nullable(championshipFormatTeamReferenceSchema)
  }),
  sideB: t.Object({
    spotUuid: t.String({ format: "uuid" }),
    team: t.Nullable(championshipFormatTeamReferenceSchema)
  }),
  competitionRoundUuid: t.Nullable(t.String({ format: "uuid" })),
  scheduledAt: t.Nullable(t.String()),
  scheduleStatus: t.Union([
    t.Literal("unscheduled"),
    t.Literal("proposed"),
    t.Literal("scheduled"),
    t.Literal("late-authorized"),
    t.Literal("played"),
    t.Literal("canceled")
  ]),
  roomProgram: t.Nullable(championshipFormatRoomProgramReferenceSchema),
  matchRulesOverride: t.Nullable(t.Record(t.String(), t.Unknown())),
  bracket: t.Union([
    t.Literal("winners"),
    t.Literal("losers"),
    t.Literal("grand-final"),
    t.Literal("placement"),
    t.Literal("none")
  ]),
  bracketRound: t.Nullable(t.Integer()),
  bracketPosition: t.Nullable(t.Integer()),
  evidenceRevision: t.Integer(),
  resultRevision: t.Integer(),
  result: t.Nullable(
    t.Object({
      sideAOfficialScore: t.Integer({ minimum: 0 }),
      sideBOfficialScore: t.Integer({ minimum: 0 }),
      sideAOutcome: t.Union([
        t.Literal("win"),
        t.Literal("loss"),
        t.Literal("draw")
      ]),
      sideBOutcome: t.Union([
        t.Literal("win"),
        t.Literal("loss"),
        t.Literal("draw")
      ])
    })
  ),
  scheduleRevision: t.Integer(),
  revision: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String()
});

const championshipSchedulingAccountSchema = t.Object({
  accountUuid: t.String({ format: "uuid" }),
  name: t.String()
});

const championshipSchedulingTeamSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  abbreviation: t.Nullable(t.String())
});

export const championshipScheduleProposalResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  parentProposalUuid: t.Nullable(t.String({ format: "uuid" })),
  proposingTeam: t.Nullable(championshipSchedulingTeamSchema),
  proposer: championshipSchedulingAccountSchema,
  mode: t.Union([t.Literal("exact-time"), t.Literal("availability-range")]),
  exactTime: t.Nullable(t.String()),
  availableFrom: t.Nullable(t.String()),
  availableTo: t.Nullable(t.String()),
  state: t.Union([
    t.Literal("pending"),
    t.Literal("countered"),
    t.Literal("accepted"),
    t.Literal("rejected"),
    t.Literal("withdrawn"),
    t.Literal("staff-decided")
  ]),
  note: t.Nullable(t.String()),
  decidedBy: t.Nullable(championshipSchedulingAccountSchema),
  decidedAt: t.Nullable(t.String()),
  revision: t.Integer({ minimum: 0 }),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const championshipLatePlayAuthorizationResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  authorizedBy: championshipSchedulingAccountSchema,
  reason: t.String(),
  expiresAt: t.Nullable(t.String()),
  revokedAt: t.Nullable(t.String()),
  active: t.Boolean(),
  revision: t.Integer({ minimum: 0 }),
  createdAt: t.String()
});

export const championshipMatchSchedulingResponseSchema = t.Object({
  championshipRevision: t.Integer({ minimum: 0 }),
  actor: t.Object({
    access: t.Union([t.Literal("staff"), t.Literal("gm")]),
    team: t.Nullable(championshipSchedulingTeamSchema),
    canPropose: t.Boolean(),
    canIntervene: t.Boolean()
  }),
  match: t.Object({
    uuid: t.String({ format: "uuid" }),
    label: t.String(),
    sideA: t.Nullable(championshipSchedulingTeamSchema),
    sideB: t.Nullable(championshipSchedulingTeamSchema),
    scheduledAt: t.Nullable(t.String()),
    scheduleStatus: t.Union([
      t.Literal("unscheduled"),
      t.Literal("proposed"),
      t.Literal("scheduled"),
      t.Literal("late-authorized"),
      t.Literal("played"),
      t.Literal("canceled")
    ]),
    scheduleRevision: t.Integer({ minimum: 0 }),
    revision: t.Integer({ minimum: 0 })
  }),
  competitionRound: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      name: t.String(),
      startsAt: t.Nullable(t.String()),
      endsAt: t.Nullable(t.String()),
      schedulingAuthority: t.Union([
        t.Literal("staff"),
        t.Literal("gms"),
        t.Literal("staff-and-gms")
      ]),
      latePlayPolicy: t.Union([
        t.Literal("forbidden"),
        t.Literal("staff-approval"),
        t.Literal("allowed")
      ])
    })
  ),
  proposalMode: t.Union([
    t.Literal("exact-time"),
    t.Literal("availability-range"),
    t.Literal("both")
  ]),
  proposals: t.Object({
    items: t.Array(championshipScheduleProposalResponseSchema),
    total: t.Integer({ minimum: 0 }),
    truncated: t.Boolean()
  }),
  lateAuthorizations: t.Object({
    items: t.Array(championshipLatePlayAuthorizationResponseSchema),
    total: t.Integer({ minimum: 0 }),
    truncated: t.Boolean()
  })
});

export const championshipRouteResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  sourceKind: t.Union([
    t.Literal("match-outcome"),
    t.Literal("classification-rank"),
    t.Literal("manual")
  ]),
  sourceMatchUuid: t.Nullable(t.String({ format: "uuid" })),
  sourceGroupUuid: t.Nullable(t.String({ format: "uuid" })),
  sourceOutcome: t.Nullable(
    t.Union([t.Literal("winner"), t.Literal("loser"), t.Literal("rank")])
  ),
  sourceRank: t.Nullable(t.Integer()),
  condition: t.Union([
    t.Literal("always"),
    t.Literal("if-side-a-wins"),
    t.Literal("if-side-b-wins")
  ]),
  destinationSpotUuid: t.String({ format: "uuid" }),
  priority: t.Integer(),
  state: t.Union([t.Literal("active"), t.Literal("disabled")]),
  createdAt: t.String(),
  updatedAt: t.String()
});

const boundedFormatCollection = <Schema extends ReturnType<typeof t.Object>>(
  schema: Schema
) =>
  t.Object({
    items: t.Array(schema),
    totalCount: t.Integer(),
    truncated: t.Boolean()
  });

export const championshipFormatResponseSchema = t.Object({
  championshipUuid: t.String({ format: "uuid" }),
  championshipRevision: t.Integer(),
  limit: t.Integer(),
  stages: boundedFormatCollection(championshipStageResponseSchema),
  groups: boundedFormatCollection(championshipGroupResponseSchema),
  spots: boundedFormatCollection(championshipSpotResponseSchema),
  routes: boundedFormatCollection(championshipRouteResponseSchema),
  competitionRounds: boundedFormatCollection(
    championshipCompetitionRoundResponseSchema
  ),
  matches: boundedFormatCollection(championshipFormatMatchResponseSchema)
});

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

const championshipStandingsVisibleMetricSchema = t.Union([
  t.Literal("played"),
  t.Literal("wins"),
  t.Literal("draws"),
  t.Literal("losses"),
  t.Literal("score-for"),
  t.Literal("score-against"),
  t.Literal("score-difference"),
  t.Literal("points")
]);

export const championshipStandingsResponseSchema = t.Object({
  championshipUuid: t.String({ format: "uuid" }),
  championshipRevision: t.Integer({ minimum: 0 }),
  stage: t.Object({
    uuid: t.String({ format: "uuid" }),
    name: t.String(),
    revision: t.Integer({ minimum: 0 })
  }),
  group: championshipGroupResponseSchema,
  scoring: t.Union([
    t.Object({
      mode: t.Literal("points"),
      win: t.Integer(),
      draw: t.Integer(),
      loss: t.Integer()
    }),
    t.Object({
      mode: t.Literal("results"),
      win: t.Null(),
      draw: t.Null(),
      loss: t.Null()
    })
  ]),
  visibleMetrics: t.Array(championshipStandingsVisibleMetricSchema),
  headToHeadRestart: t.Union([
    t.Literal("continue"),
    t.Literal("restart-for-subgroup")
  ]),
  rules: t.Array(
    t.Object({
      uuid: t.Nullable(t.String({ format: "uuid" })),
      position: t.Integer({ minimum: 0 }),
      criterion: championshipStandingsCriterionSchema,
      direction: t.Union([t.Literal("asc"), t.Literal("desc")]),
      config: t.Nullable(t.Record(t.String(), t.Unknown()))
    })
  ),
  rows: t.Array(
    t.Object({
      rank: t.Integer({ minimum: 1 }),
      team: championshipFormatTeamReferenceSchema,
      played: t.Integer({ minimum: 0 }),
      wins: t.Integer({ minimum: 0 }),
      draws: t.Integer({ minimum: 0 }),
      losses: t.Integer({ minimum: 0 }),
      points: t.Nullable(t.Integer()),
      scoreFor: t.Integer({ minimum: 0 }),
      scoreAgainst: t.Integer({ minimum: 0 }),
      scoreDifference: t.Integer(),
      unresolvedTie: t.Boolean(),
      tieGroup: t.Nullable(t.String()),
      criteria: t.Array(
        t.Object({
          criterion: championshipStandingsCriterionSchema,
          value: t.Integer(),
          scope: t.Union([
            t.Literal("overall"),
            t.Literal("head-to-head"),
            t.Literal("manual")
          ])
        })
      )
    })
  ),
  unresolvedTies: t.Array(
    t.Object({
      key: t.String(),
      rankFrom: t.Integer({ minimum: 1 }),
      rankTo: t.Integer({ minimum: 1 }),
      teamUuids: t.Array(t.String({ format: "uuid" }))
    })
  ),
  qualification: t.Array(
    t.Object({
      routeUuid: t.String({ format: "uuid" }),
      rank: t.Integer({ minimum: 1 }),
      destinationSpotUuid: t.String({ format: "uuid" }),
      destinationSpotLabel: t.String(),
      previousTeam: t.Nullable(championshipFormatTeamReferenceSchema),
      nextTeam: t.Nullable(championshipFormatTeamReferenceSchema),
      changed: t.Boolean(),
      blocked: t.Boolean(),
      reason: t.Nullable(t.String())
    })
  ),
  affectedMatches: t.Array(
    t.Object({
      matchUuid: t.String({ format: "uuid" }),
      label: t.String(),
      depth: t.Integer({ minimum: 1 }),
      hadResult: t.Boolean(),
      hadEvidence: t.Boolean()
    })
  ),
  canApply: t.Boolean(),
  latestRun: t.Nullable(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      revision: t.Integer({ minimum: 0 }),
      status: t.Union([t.Literal("resolved"), t.Literal("unresolved-tie")]),
      createdAt: t.String()
    })
  )
});

export const championshipRoundRobinPreviewResponseSchema = t.Object({
  stageUuid: t.String({ format: "uuid" }),
  groups: t.Array(
    t.Object({
      uuid: t.String({ format: "uuid" }),
      name: t.String(),
      teams: t.Array(championshipFormatTeamReferenceSchema)
    })
  ),
  pairings: t.Object({
    items: t.Array(
      t.Object({
        key: t.String(),
        sideA: championshipFormatTeamReferenceSchema,
        sideB: championshipFormatTeamReferenceSchema,
        groupUuid: t.Nullable(t.String({ format: "uuid" })),
        meeting: t.Integer({ minimum: 1 }),
        existing: t.Boolean(),
        competitionRoundUuid: t.Nullable(t.String({ format: "uuid" }))
      })
    ),
    totalCount: t.Integer({ minimum: 0 }),
    truncated: t.Boolean()
  }),
  desiredMatchCount: t.Integer({ minimum: 0 }),
  existingMatchCount: t.Integer({ minimum: 0 }),
  missingMatchCount: t.Integer({ minimum: 0 }),
  excessMatchCount: t.Integer({ minimum: 0 }),
  canGenerate: t.Boolean(),
  generationBlockedReason: t.Nullable(t.String()),
  matchCountsByTeam: t.Array(
    t.Object({
      team: championshipFormatTeamReferenceSchema,
      desired: t.Integer({ minimum: 0 }),
      existing: t.Integer({ minimum: 0 }),
      missing: t.Integer({ minimum: 0 })
    })
  )
});

const championshipSpotPlacementEndpointSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  label: t.String(),
  revision: t.Integer({ minimum: 0 }),
  previousTeam: t.Nullable(championshipFormatTeamReferenceSchema),
  nextTeam: t.Nullable(championshipFormatTeamReferenceSchema)
});

export const championshipSpotPlacementPreviewResponseSchema = t.Object({
  championshipUuid: t.String({ format: "uuid" }),
  championshipRevision: t.Integer({ minimum: 0 }),
  targetSpot: championshipSpotPlacementEndpointSchema,
  sourceSpot: t.Nullable(championshipSpotPlacementEndpointSchema),
  affectedMatches: t.Array(
    t.Object({
      matchUuid: t.String({ format: "uuid" }),
      label: t.String(),
      depth: t.Integer({ minimum: 1 }),
      hadResult: t.Boolean(),
      hadEvidence: t.Boolean()
    }),
    { maxItems: 500 }
  ),
  requiresConfirmation: t.Boolean()
});

export const championshipDoubleEliminationPreviewResponseSchema = t.Object({
  teamCount: t.Integer(),
  bracketSize: t.Integer(),
  winnersRoundCount: t.Integer(),
  losersRoundCount: t.Integer(),
  grandFinalReset: t.Boolean(),
  spots: t.Array(
    t.Object({
      key: t.String(),
      label: t.String(),
      kind: t.Union([t.Literal("match-side"), t.Literal("placement")]),
      displayOrder: t.Integer(),
      placementRank: t.Nullable(t.Integer({ minimum: 1 })),
      team: t.Nullable(championshipFormatTeamReferenceSchema),
      x: t.Integer(),
      y: t.Integer()
    })
  ),
  matches: t.Array(
    t.Object({
      key: t.String(),
      label: t.String(),
      displayOrder: t.Integer(),
      bracket: t.Union([
        t.Literal("winners"),
        t.Literal("losers"),
        t.Literal("grand-final")
      ]),
      round: t.Integer(),
      position: t.Integer(),
      sideASpotKey: t.String(),
      sideBSpotKey: t.String(),
      autoBye: t.Boolean()
    })
  ),
  routes: t.Array(
    t.Object({
      sourceMatchKey: t.String(),
      sourceOutcome: t.Union([t.Literal("winner"), t.Literal("loser")]),
      destinationSpotKey: t.String(),
      condition: t.Union([
        t.Literal("always"),
        t.Literal("if-side-a-wins"),
        t.Literal("if-side-b-wins")
      ])
    })
  )
});

export const listCompetitionTypesResponseSchema = paginatedResponseSchema(
  championshipCompetitionTypeResponseSchema
);
export const listChampionshipsResponseSchema = paginatedResponseSchema(
  championshipSummaryResponseSchema
);
export const listTeamIdentitiesResponseSchema = paginatedResponseSchema(
  championshipTeamIdentityResponseSchema
);
export const listChampionshipTeamsResponseSchema = paginatedResponseSchema(
  championshipTeamResponseSchema
);
export const listChampionshipParticipantsResponseSchema =
  paginatedResponseSchema(championshipParticipantResponseSchema);
export const listChampionshipRosterHistoryResponseSchema =
  paginatedResponseSchema(championshipRosterMembershipResponseSchema);
export const listChampionshipAuditResponseSchema = paginatedResponseSchema(
  championshipAuditEventResponseSchema
);
export const listChampionshipThreadsResponseSchema = paginatedResponseSchema(
  championshipThreadResponseSchema
);
export const listChampionshipCommentsResponseSchema = paginatedResponseSchema(
  championshipCommentResponseSchema
);
export const listChampionshipAssignmentsResponseSchema =
  paginatedResponseSchema(championshipAssignmentResponseSchema);
export const listChampionshipInboxResponseSchema = paginatedResponseSchema(
  championshipInboxItemResponseSchema
);
export const listChampionshipSavedViewsResponseSchema = paginatedResponseSchema(
  championshipSavedViewResponseSchema
);

export type ChampionshipCompetitionTypeResponse = Static<
  typeof championshipCompetitionTypeResponseSchema
>;
export type ChampionshipTeamIdentityResponse = Static<
  typeof championshipTeamIdentityResponseSchema
>;
export type ChampionshipTeamResponse = Static<
  typeof championshipTeamResponseSchema
>;
export type ChampionshipParticipantResponse = Static<
  typeof championshipParticipantResponseSchema
>;
export type ChampionshipRosterMembershipResponse = Static<
  typeof championshipRosterMembershipResponseSchema
>;
export type ChampionshipSalaryProjectionResponse = Static<
  typeof championshipSalaryProjectionResponseSchema
>;
export type ChampionshipRosterMovePreviewResponse = Static<
  typeof championshipRosterMovePreviewResponseSchema
>;
export type ChampionshipRosterOrderResponse = Static<
  typeof championshipRosterOrderResponseSchema
>;
export type ChampionshipDraftResponse = Static<
  typeof championshipDraftResponseSchema
>;
export type ChampionshipDraftCorrectionPreviewResponse = Static<
  typeof championshipDraftCorrectionPreviewResponseSchema
>;
export type ChampionshipRecordedDraftPreviewResponse = Static<
  typeof championshipRecordedDraftPreviewResponseSchema
>;
export type ChampionshipTradeResponse = Static<
  typeof championshipTradeResponseSchema
>;
export type ChampionshipSummaryResponse = Static<
  typeof championshipSummaryResponseSchema
>;
export type ChampionshipDetailResponse = Static<
  typeof championshipDetailResponseSchema
>;
export type ChampionshipAuditEventResponse = Static<
  typeof championshipAuditEventResponseSchema
>;
export type ChampionshipCommentResponse = Static<
  typeof championshipCommentResponseSchema
>;
export type ChampionshipThreadResponse = Static<
  typeof championshipThreadResponseSchema
>;
export type ChampionshipAssignmentResponse = Static<
  typeof championshipAssignmentResponseSchema
>;
export type ChampionshipPresenceResponse = Static<
  typeof championshipPresenceResponseSchema
>;
export type ChampionshipInboxItemResponse = Static<
  typeof championshipInboxItemResponseSchema
>;
export type ChampionshipSavedViewResponse = Static<
  typeof championshipSavedViewResponseSchema
>;
export type ChampionshipFormatResponse = Static<
  typeof championshipFormatResponseSchema
>;
export type ChampionshipStandingsResponse = Static<
  typeof championshipStandingsResponseSchema
>;
export type ChampionshipRoundRobinPreviewResponse = Static<
  typeof championshipRoundRobinPreviewResponseSchema
>;
export type ChampionshipSpotPlacementPreviewResponse = Static<
  typeof championshipSpotPlacementPreviewResponseSchema
>;
export type ChampionshipDoubleEliminationPreviewResponse = Static<
  typeof championshipDoubleEliminationPreviewResponseSchema
>;
export type ChampionshipStageResponse = Static<
  typeof championshipStageResponseSchema
>;
export type ChampionshipSpotResponse = Static<
  typeof championshipSpotResponseSchema
>;
export type ChampionshipRouteResponse = Static<
  typeof championshipRouteResponseSchema
>;
export type ChampionshipCompetitionRoundResponse = Static<
  typeof championshipCompetitionRoundResponseSchema
>;
export type ChampionshipFormatMatchResponse = Static<
  typeof championshipFormatMatchResponseSchema
>;
export type ChampionshipScheduleProposalResponse = Static<
  typeof championshipScheduleProposalResponseSchema
>;
export type ChampionshipLatePlayAuthorizationResponse = Static<
  typeof championshipLatePlayAuthorizationResponseSchema
>;
export type ChampionshipMatchSchedulingResponse = Static<
  typeof championshipMatchSchedulingResponseSchema
>;
