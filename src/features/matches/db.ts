import { sql } from "drizzle-orm";
import {
  check,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { gameModes } from "@/features/game-modes/db";
import { players } from "@/features/players/db";
import { recordings } from "@/features/recordings/db";
import { eventSchemaVersions } from "@/features/event-schemas/db";

export const matches = sqliteTable(
  "matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull().unique(),
    status: text("status", { enum: ["ongoing", "completed"] }).notNull(),
    recordingId: integer("recording_id")
      .references(() => recordings.id)
      .unique(),
    gameModeId: integer("game_mode_id").references(() => gameModes.id),
    eventSchemaVersionId: integer("event_schema_version_id").references(
      () => eventSchemaVersions.id
    ),
    initiatedAt: text("initiated_at"),
    endedAt: text("ended_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("matches_id_event_schema_version_id_unique").on(
      table.id,
      table.eventSchemaVersionId
    )
  ]
);

export const matchTeamMetadata = sqliteTable(
  "match_team_metadata",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    team: text("team", { enum: ["red", "blue"] }).notNull(),
    score: integer("score").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("match_team_metadata_match_id_team_unique").on(
      table.matchId,
      table.team
    )
  ]
);

export const matchPlayerStints = sqliteTable("match_player_stints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  team: text("team", { enum: ["red", "blue"] }).notNull(),
  roomPlayerId: integer("room_player_id"),
  joinedAt: text("joined_at"),
  leftAt: text("left_at"),
  joinedElapsedSeconds: real("joined_elapsed_seconds"),
  leftElapsedSeconds: real("left_elapsed_seconds"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
});

export const composedMatches = sqliteTable(
  "composed_matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull().unique(),
    firstMatchId: integer("first_match_id")
      .notNull()
      .references(() => matches.id)
      .unique(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    check(
      "composed_matches_public_id_check",
      sql`length(${table.publicId}) = 9 and ${table.publicId} glob 'c[a-z2-9][a-z2-9][a-z2-9][a-z2-9][a-z2-9][a-z2-9][a-z2-9][a-z2-9]'`
    )
  ]
);

export const composedMatchRounds = sqliteTable(
  "composed_match_rounds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    composedMatchId: integer("composed_match_id")
      .notNull()
      .references(() => composedMatches.id),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id)
      .unique(),
    kind: text("kind", { enum: ["sequential", "extra-time"] }).notNull(),
    roundNumber: integer("round_number"),
    teamOrientation: text("team_orientation", {
      enum: ["aligned", "swapped"]
    })
      .notNull()
      .default("aligned"),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("composed_match_rounds_composition_position_unique").on(
      table.composedMatchId,
      table.position
    ),
    uniqueIndex("composed_match_rounds_composition_number_unique").on(
      table.composedMatchId,
      table.roundNumber
    ),
    uniqueIndex("composed_match_rounds_extra_time_unique")
      .on(table.composedMatchId)
      .where(sql`${table.kind} = 'extra-time'`),
    check(
      "composed_match_rounds_kind_number_check",
      sql`(${table.kind} = 'sequential' and ${table.roundNumber} is not null and ${table.roundNumber} >= 1) or (${table.kind} = 'extra-time' and ${table.roundNumber} is null)`
    ),
    check("composed_match_rounds_position_check", sql`${table.position} >= 1`)
  ]
);

export type Match = typeof matches.$inferSelect;
export type MatchTeamMetadata = typeof matchTeamMetadata.$inferSelect;
export type MatchPlayerStint = typeof matchPlayerStints.$inferSelect;
export type ComposedMatch = typeof composedMatches.$inferSelect;
export type ComposedMatchRound = typeof composedMatchRounds.$inferSelect;
