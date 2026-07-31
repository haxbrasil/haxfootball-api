import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { accounts } from "@/features/accounts/db";
import { championships } from "@/features/championships/core/db";
import {
  championshipHistoricalPlayerIdentities,
  championshipParticipants,
  championshipTeamIdentities,
  championshipTeams
} from "@/features/championships/people/db";

export const championshipPlacements = sqliteTable(
  "championship_placements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    teamId: integer("team_id")
      .notNull()
      .references(() => championshipTeams.id),
    rank: integer("rank").notNull(),
    teamIdentityIdSnapshot: integer("team_identity_id_snapshot").references(
      () => championshipTeamIdentities.id
    ),
    teamNameSnapshot: text("team_name_snapshot").notNull(),
    source: text("source", {
      enum: ["format", "staff", "historical-import"]
    }).notNull(),
    awardedByAccountId: integer("awarded_by_account_id").references(
      () => accounts.id
    ),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_placements_rank_unique").on(
      table.championshipId,
      table.rank
    ),
    uniqueIndex("championship_placements_team_unique").on(
      table.championshipId,
      table.teamId
    ),
    index("championship_placements_identity_idx").on(
      table.teamIdentityIdSnapshot,
      table.rank,
      table.id
    )
  ]
);

export const championshipAwards = sqliteTable(
  "championship_awards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    kind: text("kind").notNull(),
    rank: integer("rank"),
    targetType: text("target_type", {
      enum: [
        "team",
        "team-identity",
        "participant",
        "account",
        "historical-player"
      ]
    }).notNull(),
    teamId: integer("team_id").references(() => championshipTeams.id),
    teamIdentityIdSnapshot: integer("team_identity_id_snapshot").references(
      () => championshipTeamIdentities.id
    ),
    participantId: integer("participant_id").references(
      () => championshipParticipants.id
    ),
    accountId: integer("account_id").references(() => accounts.id),
    historicalPlayerIdentityId: integer(
      "historical_player_identity_id"
    ).references(() => championshipHistoricalPlayerIdentities.id),
    displayLabel: text("display_label").notNull(),
    note: text("note"),
    awardedByAccountId: integer("awarded_by_account_id").references(
      () => accounts.id
    ),
    awardedAt: text("awarded_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_awards_kind_idx").on(
      table.championshipId,
      table.kind,
      table.id
    ),
    index("championship_awards_account_idx").on(
      table.accountId,
      table.kind,
      table.id
    ),
    index("championship_awards_identity_idx").on(
      table.teamIdentityIdSnapshot,
      table.kind,
      table.id
    )
  ]
);

export const championshipRecords = sqliteTable(
  "championship_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id").references(
      () => championships.id
    ),
    scope: text("scope", { enum: ["championship", "all-time"] }).notNull(),
    metricKey: text("metric_key").notNull(),
    targetType: text("target_type", {
      enum: ["team", "participant", "account", "historical-player"]
    }).notNull(),
    targetUuid: text("target_uuid").notNull(),
    numericValue: real("numeric_value"),
    textValue: text("text_value"),
    sourceResultRevisionUuid: text("source_result_revision_uuid"),
    state: text("state", { enum: ["current", "superseded"] })
      .notNull()
      .default("current"),
    computedAt: text("computed_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_records_metric_state_idx").on(
      table.scope,
      table.metricKey,
      table.state,
      table.id
    )
  ]
);

export const championshipHistoricalImportBatches = sqliteTable(
  "championship_historical_import_batches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id").references(
      () => championships.id
    ),
    format: text("format", { enum: ["csv", "json"] }).notNull(),
    sourceName: text("source_name").notNull(),
    sourceSha256: text("source_sha256").notNull(),
    mapping: text("mapping", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    state: text("state", {
      enum: ["previewed", "applying", "applied", "failed", "rolled-back"]
    })
      .notNull()
      .default("previewed"),
    rowCount: integer("row_count").notNull(),
    appliedCount: integer("applied_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    initiatedByAccountId: integer("initiated_by_account_id")
      .notNull()
      .references(() => accounts.id),
    appliedAt: text("applied_at"),
    rolledBackAt: text("rolled_back_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_import_batches_source_unique").on(
      table.sourceSha256,
      table.championshipId
    ),
    index("championship_import_batches_state_idx").on(table.state, table.id)
  ]
);

export const championshipHistoricalImportRows = sqliteTable(
  "championship_historical_import_rows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batchId: integer("batch_id")
      .notNull()
      .references(() => championshipHistoricalImportBatches.id),
    rowNumber: integer("row_number").notNull(),
    sourceKey: text("source_key"),
    raw: text("raw", { mode: "json" }).$type<unknown>().notNull(),
    normalized: text("normalized", { mode: "json" }).$type<unknown>(),
    state: text("state", {
      enum: ["valid", "warning", "invalid", "applied", "rolled-back"]
    }).notNull(),
    entityType: text("entity_type"),
    entityUuid: text("entity_uuid"),
    before: text("before", { mode: "json" }).$type<unknown>(),
    after: text("after", { mode: "json" }).$type<unknown>(),
    messages: text("messages", { mode: "json" }).$type<string[]>(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_import_rows_number_unique").on(
      table.batchId,
      table.rowNumber
    ),
    index("championship_import_rows_state_idx").on(
      table.batchId,
      table.state,
      table.id
    )
  ]
);

export const championshipHistoricalUnknownValues = sqliteTable(
  "championship_historical_unknown_values",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batchRowId: integer("batch_row_id").references(
      () => championshipHistoricalImportRows.id
    ),
    championshipId: integer("championship_id").references(
      () => championships.id
    ),
    entityType: text("entity_type").notNull(),
    entityUuid: text("entity_uuid"),
    field: text("field").notNull(),
    rawValue: text("raw_value"),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_unknown_values_entity_idx").on(
      table.entityType,
      table.entityUuid,
      table.id
    )
  ]
);

export type ChampionshipAward = typeof championshipAwards.$inferSelect;
export type ChampionshipHistoricalImportBatch =
  typeof championshipHistoricalImportBatches.$inferSelect;
