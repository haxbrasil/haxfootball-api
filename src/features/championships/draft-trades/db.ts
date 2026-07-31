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
import {
  championshipParticipants,
  championshipTeams
} from "@/features/championships/people/db";

export const championshipDrafts = sqliteTable(
  "championship_drafts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    state: text("state", {
      enum: ["setup", "live", "completed", "canceled"]
    })
      .notNull()
      .default("setup"),
    rounds: integer("rounds").notNull(),
    countdownSeconds: integer("countdown_seconds").notNull(),
    nextTurnSequence: integer("next_turn_sequence").notNull().default(1),
    revision: integer("revision").notNull().default(0),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    canceledAt: text("canceled_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_drafts_championship_unique").on(
      table.championshipId
    )
  ]
);

export const championshipDraftOrder = sqliteTable(
  "championship_draft_order",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    draftId: integer("draft_id")
      .notNull()
      .references(() => championshipDrafts.id),
    teamId: integer("team_id")
      .notNull()
      .references(() => championshipTeams.id),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_draft_order_position_unique").on(
      table.draftId,
      table.position
    ),
    uniqueIndex("championship_draft_order_team_unique").on(
      table.draftId,
      table.teamId
    )
  ]
);

export const championshipDraftTurns = sqliteTable(
  "championship_draft_turns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    draftId: integer("draft_id")
      .notNull()
      .references(() => championshipDrafts.id),
    sequence: integer("sequence").notNull(),
    round: integer("round").notNull(),
    position: integer("position").notNull(),
    teamId: integer("team_id")
      .notNull()
      .references(() => championshipTeams.id),
    state: text("state", {
      enum: ["pending", "open", "overdue", "filled", "voided"]
    })
      .notNull()
      .default("pending"),
    selectedParticipantId: integer("selected_participant_id").references(
      () => championshipParticipants.id
    ),
    priceUnitsSnapshot: integer("price_units_snapshot"),
    openedAt: text("opened_at"),
    deadlineAt: text("deadline_at"),
    overdueAt: text("overdue_at"),
    filledAt: text("filled_at"),
    selectedByAccountId: integer("selected_by_account_id").references(
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
    uniqueIndex("championship_draft_turns_sequence_unique").on(
      table.draftId,
      table.sequence
    ),
    uniqueIndex("championship_draft_turns_participant_unique").on(
      table.draftId,
      table.selectedParticipantId
    ),
    index("championship_draft_turns_state_sequence_idx").on(
      table.draftId,
      table.state,
      table.sequence
    )
  ]
);

export const championshipTrades = sqliteTable(
  "championship_trades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    proposingTeamId: integer("proposing_team_id")
      .notNull()
      .references(() => championshipTeams.id),
    receivingTeamId: integer("receiving_team_id")
      .notNull()
      .references(() => championshipTeams.id),
    state: text("state", {
      enum: ["proposed", "accepted", "rejected", "canceled", "expired"]
    })
      .notNull()
      .default("proposed"),
    proposerAccountId: integer("proposer_account_id")
      .notNull()
      .references(() => accounts.id),
    decidedByAccountId: integer("decided_by_account_id").references(
      () => accounts.id
    ),
    proposingValueUnits: integer("proposing_value_units").notNull(),
    receivingValueUnits: integer("receiving_value_units").notNull(),
    maximumDifferenceUnitsSnapshot: integer(
      "maximum_difference_units_snapshot"
    ).notNull(),
    proposedAt: text("proposed_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    deadlineAt: text("deadline_at"),
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
    index("championship_trades_state_id_idx").on(
      table.championshipId,
      table.state,
      table.id
    ),
    check(
      "championship_trades_distinct_teams_check",
      sql`${table.proposingTeamId} <> ${table.receivingTeamId}`
    )
  ]
);

export const championshipTradeItems = sqliteTable(
  "championship_trade_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tradeId: integer("trade_id")
      .notNull()
      .references(() => championshipTrades.id),
    participantId: integer("participant_id")
      .notNull()
      .references(() => championshipParticipants.id),
    fromTeamId: integer("from_team_id")
      .notNull()
      .references(() => championshipTeams.id),
    toTeamId: integer("to_team_id")
      .notNull()
      .references(() => championshipTeams.id),
    frozenPriceUnits: integer("frozen_price_units").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_trade_items_participant_unique").on(
      table.tradeId,
      table.participantId
    ),
    index("championship_trade_items_from_team_idx").on(
      table.tradeId,
      table.fromTeamId
    )
  ]
);

export type ChampionshipDraft = typeof championshipDrafts.$inferSelect;
export type ChampionshipDraftTurn = typeof championshipDraftTurns.$inferSelect;
export type ChampionshipTrade = typeof championshipTrades.$inferSelect;
