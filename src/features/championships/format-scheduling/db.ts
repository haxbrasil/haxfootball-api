import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { accounts } from "@/features/accounts/db";
import {
  championshipRoomPrograms,
  championships
} from "@/features/championships/core/db";
import { championshipTeams } from "@/features/championships/people/db";
import { roomPrograms, roomProgramVersions } from "@/features/rooms/core-db";

export const championshipStages = sqliteTable(
  "championship_stages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull(),
    engine: text("engine", {
      enum: ["manual", "single-elimination", "double-elimination", "standings"]
    }).notNull(),
    state: text("state", { enum: ["draft", "active", "completed"] })
      .notNull()
      .default("draft"),
    configSchemaVersion: integer("config_schema_version").notNull().default(1),
    config: text("config", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    defaultChampionshipRoomProgramId: integer(
      "default_championship_room_program_id"
    ).references(() => championshipRoomPrograms.id),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_stages_order_unique").on(
      table.championshipId,
      table.displayOrder
    ),
    index("championship_stages_state_idx").on(
      table.championshipId,
      table.state,
      table.id
    )
  ]
);

export const championshipGroups = sqliteTable(
  "championship_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    stageId: integer("stage_id")
      .notNull()
      .references(() => championshipStages.id),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_groups_order_unique").on(
      table.stageId,
      table.displayOrder
    )
  ]
);

export const championshipSpots = sqliteTable(
  "championship_spots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    stageId: integer("stage_id")
      .notNull()
      .references(() => championshipStages.id),
    groupId: integer("group_id").references(() => championshipGroups.id),
    key: text("key").notNull(),
    label: text("label").notNull(),
    kind: text("kind", {
      enum: [
        "seed",
        "group-entry",
        "match-side",
        "qualification",
        "placement",
        "manual"
      ]
    }).notNull(),
    displayOrder: integer("display_order").notNull(),
    placementRank: integer("placement_rank"),
    currentTeamId: integer("current_team_id").references(
      () => championshipTeams.id
    ),
    x: integer("x"),
    y: integer("y"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_spots_stage_key_unique").on(
      table.stageId,
      table.key
    ),
    uniqueIndex("championship_spots_placement_rank_unique").on(
      table.championshipId,
      table.placementRank
    ),
    index("championship_spots_group_order_idx").on(
      table.groupId,
      table.displayOrder,
      table.id
    ),
    index("championship_spots_team_idx").on(
      table.championshipId,
      table.currentTeamId
    )
  ]
);

export const championshipCompetitionRounds = sqliteTable(
  "championship_competition_rounds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    stageId: integer("stage_id").references(() => championshipStages.id),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    schedulingAuthority: text("scheduling_authority", {
      enum: ["staff", "gms", "staff-and-gms"]
    }),
    latePlayPolicy: text("late_play_policy", {
      enum: ["forbidden", "staff-approval", "allowed"]
    }),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_competition_rounds_sequence_unique").on(
      table.championshipId,
      table.sequence
    )
  ]
);

export const championshipMatches = sqliteTable(
  "championship_matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    stageId: integer("stage_id")
      .notNull()
      .references(() => championshipStages.id),
    groupId: integer("group_id").references(() => championshipGroups.id),
    label: text("label").notNull(),
    displayOrder: integer("display_order").notNull(),
    sideASpotId: integer("side_a_spot_id")
      .notNull()
      .references(() => championshipSpots.id),
    sideBSpotId: integer("side_b_spot_id")
      .notNull()
      .references(() => championshipSpots.id),
    sideATeamId: integer("side_a_team_id").references(
      () => championshipTeams.id
    ),
    sideBTeamId: integer("side_b_team_id").references(
      () => championshipTeams.id
    ),
    competitionRoundId: integer("competition_round_id").references(
      () => championshipCompetitionRounds.id
    ),
    scheduledAt: text("scheduled_at"),
    scheduleStatus: text("schedule_status", {
      enum: [
        "unscheduled",
        "proposed",
        "scheduled",
        "late-authorized",
        "played",
        "canceled"
      ]
    })
      .notNull()
      .default("unscheduled"),
    roomProgramId: integer("room_program_id").references(() => roomPrograms.id),
    roomProgramVersionId: integer("room_program_version_id").references(
      () => roomProgramVersions.id
    ),
    matchRulesOverride: text("match_rules_override", {
      mode: "json"
    }).$type<Record<string, unknown>>(),
    bracket: text("bracket", {
      enum: ["winners", "losers", "grand-final", "placement", "none"]
    })
      .notNull()
      .default("none"),
    bracketRound: integer("bracket_round"),
    bracketPosition: integer("bracket_position"),
    evidenceRevision: integer("evidence_revision").notNull().default(0),
    resultRevision: integer("result_revision").notNull().default(0),
    scheduleRevision: integer("schedule_revision").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_matches_stage_order_unique").on(
      table.stageId,
      table.displayOrder
    ),
    index("championship_matches_round_schedule_idx").on(
      table.competitionRoundId,
      table.scheduledAt,
      table.id
    ),
    index("championship_matches_stage_bracket_idx").on(
      table.stageId,
      table.bracket,
      table.bracketRound,
      table.bracketPosition
    )
  ]
);

export const championshipProgressionRoutes = sqliteTable(
  "championship_progression_routes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    sourceKind: text("source_kind", {
      enum: ["match-outcome", "classification-rank", "manual"]
    }).notNull(),
    sourceMatchId: integer("source_match_id").references(
      () => championshipMatches.id
    ),
    sourceGroupId: integer("source_group_id").references(
      () => championshipGroups.id
    ),
    sourceOutcome: text("source_outcome", {
      enum: ["winner", "loser", "rank"]
    }),
    sourceRank: integer("source_rank"),
    condition: text("condition", {
      enum: ["always", "if-side-a-wins", "if-side-b-wins"]
    })
      .notNull()
      .default("always"),
    destinationSpotId: integer("destination_spot_id")
      .notNull()
      .references(() => championshipSpots.id),
    priority: integer("priority").notNull().default(0),
    state: text("state", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_progression_routes_source_unique").on(
      table.sourceKind,
      table.sourceMatchId,
      table.sourceGroupId,
      table.sourceOutcome,
      table.sourceRank,
      table.destinationSpotId
    ),
    index("championship_progression_routes_destination_idx").on(
      table.destinationSpotId,
      table.state
    )
  ]
);

export const championshipClassificationRules = sqliteTable(
  "championship_classification_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    stageId: integer("stage_id")
      .notNull()
      .references(() => championshipStages.id),
    position: integer("position").notNull(),
    criterion: text("criterion", {
      enum: [
        "points",
        "wins",
        "score-difference",
        "score-for",
        "score-against",
        "head-to-head",
        "head-to-head-points",
        "head-to-head-score-difference",
        "manual"
      ]
    }).notNull(),
    direction: text("direction", { enum: ["asc", "desc"] })
      .notNull()
      .default("desc"),
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_classification_rules_position_unique").on(
      table.stageId,
      table.position
    )
  ]
);

export const championshipClassificationRuns = sqliteTable(
  "championship_classification_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    stageId: integer("stage_id")
      .notNull()
      .references(() => championshipStages.id),
    groupId: integer("group_id").references(() => championshipGroups.id),
    revision: integer("revision").notNull(),
    status: text("status", { enum: ["resolved", "unresolved-tie"] }).notNull(),
    input: text("input", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    result: text("result", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    createdByAccountId: integer("created_by_account_id").references(
      () => accounts.id
    ),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_classification_runs_stage_id_idx").on(
      table.stageId,
      table.id
    )
  ]
);

export const championshipScheduleProposals = sqliteTable(
  "championship_schedule_proposals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipMatchId: integer("championship_match_id")
      .notNull()
      .references(() => championshipMatches.id),
    parentProposalId: integer("parent_proposal_id"),
    proposingTeamId: integer("proposing_team_id").references(
      () => championshipTeams.id
    ),
    proposingAccountId: integer("proposing_account_id")
      .notNull()
      .references(() => accounts.id),
    mode: text("mode", {
      enum: ["exact-time", "availability-range"]
    }).notNull(),
    exactTime: text("exact_time"),
    availableFrom: text("available_from"),
    availableTo: text("available_to"),
    state: text("state", {
      enum: [
        "pending",
        "countered",
        "accepted",
        "rejected",
        "withdrawn",
        "staff-decided"
      ]
    })
      .notNull()
      .default("pending"),
    note: text("note"),
    decidedByAccountId: integer("decided_by_account_id").references(
      () => accounts.id
    ),
    decidedAt: text("decided_at"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_schedule_proposals_match_state_idx").on(
      table.championshipMatchId,
      table.state,
      table.id
    )
  ]
);

export const championshipLatePlayAuthorizations = sqliteTable(
  "championship_late_play_authorizations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipMatchId: integer("championship_match_id")
      .notNull()
      .references(() => championshipMatches.id),
    authorizedByAccountId: integer("authorized_by_account_id")
      .notNull()
      .references(() => accounts.id),
    reason: text("reason").notNull(),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_late_authorizations_match_idx").on(
      table.championshipMatchId,
      table.id
    )
  ]
);

export type ChampionshipStage = typeof championshipStages.$inferSelect;
export type ChampionshipSpot = typeof championshipSpots.$inferSelect;
export type ChampionshipMatch = typeof championshipMatches.$inferSelect;
