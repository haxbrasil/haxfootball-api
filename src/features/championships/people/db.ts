import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { accounts } from "@/features/accounts/db";
import { championships } from "@/features/championships/core/db";
import { players } from "@/features/players/db";

export const championshipTeamIdentities = sqliteTable(
  "championship_team_identities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    abbreviation: text("abbreviation"),
    colors: text("colors", { mode: "json" }).$type<string[]>(),
    branding: text("branding", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    archivedAt: text("archived_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_team_identities_slug_unique").on(table.slug),
    index("championship_team_identities_archived_id_idx").on(
      table.archivedAt,
      table.id
    )
  ]
);

export const championshipTeams = sqliteTable(
  "championship_teams",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    teamIdentityId: integer("team_identity_id").references(
      () => championshipTeamIdentities.id
    ),
    name: text("name").notNull(),
    abbreviation: text("abbreviation"),
    colors: text("colors", { mode: "json" }).$type<string[]>(),
    brandingSnapshot: text("branding_snapshot", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    seed: integer("seed"),
    displayOrder: integer("display_order").notNull().default(0),
    state: text("state", { enum: ["active", "withdrawn", "disqualified"] })
      .notNull()
      .default("active"),
    rosterRevision: integer("roster_revision").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_teams_name_unique").on(
      table.championshipId,
      table.name
    ),
    uniqueIndex("championship_teams_abbreviation_unique").on(
      table.championshipId,
      table.abbreviation
    ),
    index("championship_teams_order_id_idx").on(
      table.championshipId,
      table.displayOrder,
      table.id
    )
  ]
);

export const championshipHistoricalPlayerIdentities = sqliteTable(
  "championship_historical_player_identities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    displayName: text("display_name").notNull(),
    aliases: text("aliases", { mode: "json" }).$type<string[]>(),
    notes: text("notes"),
    linkedAccountId: integer("linked_account_id").references(() => accounts.id),
    linkedAt: text("linked_at"),
    linkedByAccountId: integer("linked_by_account_id").references(
      () => accounts.id
    ),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_historical_players_account_idx").on(
      table.linkedAccountId,
      table.id
    )
  ]
);

export const championshipParticipants = sqliteTable(
  "championship_participants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    accountId: integer("account_id").references(() => accounts.id),
    playerId: integer("player_id").references(() => players.id),
    historicalPlayerIdentityId: integer(
      "historical_player_identity_id"
    ).references(() => championshipHistoricalPlayerIdentities.id),
    displayNameSnapshot: text("display_name_snapshot").notNull(),
    status: text("status", {
      enum: ["pending", "active", "withdrawn", "ineligible", "removed"]
    })
      .notNull()
      .default("pending"),
    origin: text("origin", {
      enum: ["self", "staff", "historical-import"]
    }).notNull(),
    registeredAt: text("registered_at"),
    registrationClosedAt: text("registration_closed_at"),
    withdrawnAt: text("withdrawn_at"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_participants_account_unique").on(
      table.championshipId,
      table.accountId
    ),
    uniqueIndex("championship_participants_historical_unique").on(
      table.championshipId,
      table.historicalPlayerIdentityId
    ),
    index("championship_participants_status_id_idx").on(
      table.championshipId,
      table.status,
      table.id
    ),
    check(
      "championship_participants_identity_check",
      sql`((${table.accountId} is not null) + (${table.historicalPlayerIdentityId} is not null)) = 1`
    )
  ]
);

export const championshipTeamMemberships = sqliteTable(
  "championship_team_memberships",
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
    participantId: integer("participant_id")
      .notNull()
      .references(() => championshipParticipants.id),
    role: text("role", { enum: ["gm", "player"] }).notNull(),
    acquisitionSource: text("acquisition_source", {
      enum: ["staff", "draft", "trade", "replacement", "historical-import"]
    }).notNull(),
    acquisitionReferenceUuid: text("acquisition_reference_uuid"),
    priceUnitsSnapshot: integer("price_units_snapshot"),
    displayOrder: integer("display_order").notNull().default(0),
    effectiveFromRevision: integer("effective_from_revision").notNull(),
    effectiveToRevision: integer("effective_to_revision"),
    startedAt: text("started_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    endedAt: text("ended_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_memberships_participant_active_idx").on(
      table.championshipId,
      table.participantId,
      table.endedAt
    ),
    index("championship_memberships_team_active_idx").on(
      table.teamId,
      table.endedAt,
      table.displayOrder,
      table.role
    ),
    uniqueIndex("championship_memberships_participant_active_unique")
      .on(table.championshipId, table.participantId)
      .where(sql`${table.endedAt} is null`)
  ]
);

export type ChampionshipTeamIdentity =
  typeof championshipTeamIdentities.$inferSelect;
export type ChampionshipTeam = typeof championshipTeams.$inferSelect;
export type ChampionshipParticipant =
  typeof championshipParticipants.$inferSelect;
export type ChampionshipTeamMembership =
  typeof championshipTeamMemberships.$inferSelect;
