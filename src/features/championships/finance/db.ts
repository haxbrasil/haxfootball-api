import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { accounts } from "@/features/accounts/db";
import { championships } from "@/features/championships/core/db";
import {
  championshipParticipants,
  championshipTeams
} from "@/features/championships/people/db";

export const championshipParticipantPrices = sqliteTable(
  "championship_participant_prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    participantId: integer("participant_id")
      .notNull()
      .references(() => championshipParticipants.id),
    priceUnits: integer("price_units").notNull(),
    frozenAt: text("frozen_at"),
    frozenByAccountId: integer("frozen_by_account_id").references(
      () => accounts.id
    ),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_participant_prices_unique").on(
      table.championshipId,
      table.participantId
    ),
    index("championship_participant_prices_value_idx").on(
      table.championshipId,
      table.priceUnits,
      table.id
    )
  ]
);

export const championshipSalaryLedgerEntries = sqliteTable(
  "championship_salary_ledger_entries",
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
    participantId: integer("participant_id").references(
      () => championshipParticipants.id
    ),
    membershipUuid: text("membership_uuid"),
    amountUnits: integer("amount_units").notNull(),
    kind: text("kind", {
      enum: [
        "membership-added",
        "membership-ended",
        "trade-in",
        "trade-out",
        "correction"
      ]
    }).notNull(),
    sourceUuid: text("source_uuid"),
    rosterRevision: integer("roster_revision").notNull(),
    actorAccountId: integer("actor_account_id").references(() => accounts.id),
    reason: text("reason"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_salary_ledger_team_id_idx").on(table.teamId, table.id),
    index("championship_salary_ledger_participant_id_idx").on(
      table.championshipId,
      table.participantId,
      table.id
    )
  ]
);

export const championshipCapExceptions = sqliteTable(
  "championship_cap_exceptions",
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
    state: text("state", { enum: ["active", "expired", "revoked"] })
      .notNull()
      .default("active"),
    capUnitsSnapshot: integer("cap_units_snapshot").notNull(),
    usageUnitsSnapshot: integer("usage_units_snapshot").notNull(),
    rosterRevisionSnapshot: integer("roster_revision_snapshot").notNull(),
    approvedByAccountId: integer("approved_by_account_id")
      .notNull()
      .references(() => accounts.id),
    reason: text("reason").notNull(),
    approvedAt: text("approved_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    expiresAtRevision: integer("expires_at_revision").notNull(),
    expiredAt: text("expired_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_cap_exceptions_team_state_idx").on(
      table.teamId,
      table.state,
      table.id
    )
  ]
);

export type ChampionshipParticipantPrice =
  typeof championshipParticipantPrices.$inferSelect;
export type ChampionshipCapException =
  typeof championshipCapExceptions.$inferSelect;
