import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { players } from "@/features/players/player.db";
import { recordings } from "@/features/recordings/recording.db";
import { statEventSchemaVersions } from "@/features/stat-event-schemas/stat-event-schema.db";

export const matches = sqliteTable(
  "matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull().unique(),
    status: text("status", { enum: ["ongoing", "completed"] }).notNull(),
    recordingId: integer("recording_id")
      .references(() => recordings.id)
      .unique(),
    statEventSchemaVersionId: integer("stat_event_schema_version_id").references(
      () => statEventSchemaVersions.id
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
    uniqueIndex("matches_id_stat_event_schema_version_id_unique").on(
      table.id,
      table.statEventSchemaVersionId
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

export const matchPlayerEvents = sqliteTable(
  "match_player_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    sequence: integer("sequence").notNull(),
    type: text("type", {
      enum: ["player_join", "player_leave", "player_team_change"]
    }).notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    team: text("team", { enum: ["spectators", "red", "blue"] }),
    roomPlayerId: integer("room_player_id"),
    occurredAt: text("occurred_at"),
    elapsedSeconds: real("elapsed_seconds"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("match_player_events_match_id_sequence_unique").on(
      table.matchId,
      table.sequence
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
export type MatchPlayerEvent = typeof matchPlayerEvents.$inferSelect;
export type MatchPlayerStint = typeof matchPlayerStints.$inferSelect;
