import {
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

export type Match = typeof matches.$inferSelect;
export type MatchTeamMetadata = typeof matchTeamMetadata.$inferSelect;
export type MatchPlayerStint = typeof matchPlayerStints.$inferSelect;
