import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { accounts } from "@/features/accounts/db";
import { roomPrograms } from "@/features/rooms/core-db";
import type { ChampionshipRulesV1 } from "@/features/championships/core/rules";

export const championshipCompetitionTypes = sqliteTable(
  "championship_competition_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    cadence: text("cadence", {
      enum: ["long-running", "multi-day", "single-event"]
    }),
    defaultRulesSchemaVersion: integer("default_rules_schema_version")
      .notNull()
      .default(1),
    defaultRules: text("default_rules", { mode: "json" })
      .$type<ChampionshipRulesV1>()
      .notNull(),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_competition_types_slug_unique").on(table.slug),
    index("championship_competition_types_state_id_idx").on(
      table.state,
      table.id
    )
  ]
);

export const championshipCatalogAuditEvents = sqliteTable(
  "championship_catalog_audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    competitionTypeId: integer("competition_type_id").references(
      () => championshipCompetitionTypes.id
    ),
    sequence: integer("sequence").notNull(),
    commandUuid: text("command_uuid").notNull().unique(),
    actorAccountId: integer("actor_account_id")
      .notNull()
      .references(() => accounts.id),
    action: text("action").notNull(),
    targetUuid: text("target_uuid"),
    before: text("before", { mode: "json" }).$type<unknown>(),
    after: text("after", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_catalog_audit_type_sequence_idx").on(
      table.competitionTypeId,
      table.sequence,
      table.id
    )
  ]
);

export const championships = sqliteTable(
  "championships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull(),
    competitionTypeId: integer("competition_type_id")
      .notNull()
      .references(() => championshipCompetitionTypes.id),
    name: text("name").notNull(),
    editionLabel: text("edition_label"),
    description: text("description"),
    lifecycle: text("lifecycle", {
      enum: ["setup", "active", "completed", "archived", "canceled"]
    })
      .notNull()
      .default("setup"),
    visibility: text("visibility", { enum: ["private", "public"] })
      .notNull()
      .default("private"),
    registrationState: text("registration_state", {
      enum: ["not-open", "open", "closed"]
    })
      .notNull()
      .default("not-open"),
    priceState: text("price_state", {
      enum: ["disabled", "editable", "locked"]
    })
      .notNull()
      .default("disabled"),
    rulesSchemaVersion: integer("rules_schema_version").notNull().default(1),
    rules: text("rules", { mode: "json" })
      .$type<ChampionshipRulesV1>()
      .notNull(),
    historical: integer("historical", { mode: "boolean" })
      .notNull()
      .default(false),
    revision: integer("revision").notNull().default(0),
    changeSequence: integer("change_sequence").notNull().default(0),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    publishedAt: text("published_at"),
    completedAt: text("completed_at"),
    archivedAt: text("archived_at"),
    canceledAt: text("canceled_at"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championships_slug_unique").on(table.slug),
    index("championships_visibility_lifecycle_id_idx").on(
      table.visibility,
      table.lifecycle,
      table.id
    ),
    index("championships_type_id_idx").on(table.competitionTypeId, table.id)
  ]
);

export const championshipRuleVersions = sqliteTable(
  "championship_rule_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    version: integer("version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    rules: text("rules", { mode: "json" })
      .$type<ChampionshipRulesV1>()
      .notNull(),
    actorAccountId: integer("actor_account_id").references(() => accounts.id),
    reason: text("reason"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_rule_versions_championship_version_unique").on(
      table.championshipId,
      table.version
    )
  ]
);

export const championshipRoomPrograms = sqliteTable(
  "championship_room_programs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    roomProgramId: integer("room_program_id")
      .notNull()
      .references(() => roomPrograms.id),
    state: text("state", { enum: ["active", "retired"] })
      .notNull()
      .default("active"),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    displayPolicy: text("display_policy", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_room_programs_pair_unique").on(
      table.championshipId,
      table.roomProgramId
    ),
    index("championship_room_programs_state_idx").on(
      table.championshipId,
      table.state
    )
  ]
);

export const championshipPermissionGrants = sqliteTable(
  "championship_permission_grants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    permission: text("permission").notNull(),
    grantedByAccountId: integer("granted_by_account_id").references(
      () => accounts.id
    ),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_permission_grants_unique").on(
      table.championshipId,
      table.accountId,
      table.permission
    ),
    index("championship_permission_grants_account_idx").on(
      table.accountId,
      table.championshipId
    )
  ]
);

export const championshipAuditEvents = sqliteTable(
  "championship_audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    sequence: integer("sequence").notNull(),
    correlationUuid: text("correlation_uuid").notNull(),
    commandUuid: text("command_uuid"),
    actorKind: text("actor_kind", {
      enum: ["account", "system", "room", "discord", "historical-import"]
    }).notNull(),
    actorAccountId: integer("actor_account_id").references(() => accounts.id),
    action: text("action").notNull(),
    source: text("source").notNull(),
    targetType: text("target_type").notNull(),
    targetUuid: text("target_uuid"),
    before: text("before", { mode: "json" }).$type<unknown>(),
    after: text("after", { mode: "json" }).$type<unknown>(),
    reason: text("reason"),
    metadata: text("metadata", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_audit_events_sequence_unique").on(
      table.championshipId,
      table.sequence
    ),
    uniqueIndex("championship_audit_events_command_unique").on(
      table.championshipId,
      table.commandUuid
    ),
    index("championship_audit_events_created_id_idx").on(
      table.championshipId,
      table.createdAt,
      table.id
    )
  ]
);

export const championshipCommands = sqliteTable(
  "championship_commands",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    commandUuid: text("command_uuid").notNull().unique(),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    actorAccountId: integer("actor_account_id").references(() => accounts.id),
    expectedRevision: integer("expected_revision").notNull(),
    resultingRevision: integer("resulting_revision").notNull(),
    action: text("action").notNull(),
    response: text("response", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_commands_championship_id_idx").on(
      table.championshipId,
      table.id
    )
  ]
);

export const championshipOutboxEvents = sqliteTable(
  "championship_outbox_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    auditEventId: integer("audit_event_id")
      .notNull()
      .references(() => championshipAuditEvents.id),
    topic: text("topic").notNull(),
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    state: text("state", {
      enum: ["pending", "processing", "delivered", "failed"]
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    deliveredAt: text("delivered_at"),
    lastError: text("last_error"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_outbox_events_delivery_idx").on(
      table.state,
      table.availableAt,
      table.id
    )
  ]
);

export type ChampionshipCompetitionType =
  typeof championshipCompetitionTypes.$inferSelect;
export type Championship = typeof championships.$inferSelect;
export type ChampionshipAuditEvent =
  typeof championshipAuditEvents.$inferSelect;
