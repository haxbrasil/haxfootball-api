import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { matches } from "@/features/matches/db";
import { players } from "@/features/players/db";
import { eventSchemaVersions } from "@/features/event-schemas/db";
import type { JsonValue } from "@lib";

export const matchEvents = sqliteTable(
  "match_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    matchId: integer("match_id").notNull(),
    schemaVersionId: integer("schema_version_id").references(
      () => eventSchemaVersions.id
    ),
    sequence: integer("sequence").notNull(),
    domain: text("domain", {
      enum: ["room", "game", "agent", "system"]
    }).notNull(),
    type: text("type").notNull(),
    scope: text("scope", {
      enum: ["player", "team", "match"]
    }).notNull(),
    actorPlayerId: integer("actor_player_id").references(() => players.id),
    subjectPlayerId: integer("subject_player_id").references(() => players.id),
    team: text("team", { enum: ["spectators", "red", "blue"] }),
    roomPlayerId: integer("room_player_id"),
    playId: text("play_id"),
    sourceState: text("source_state"),
    value: text("value", { mode: "json" }).$type<JsonValue>(),
    occurredAt: text("occurred_at"),
    elapsedSeconds: real("elapsed_seconds"),
    tick: real("tick"),
    disabledAt: text("disabled_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("match_events_match_id_sequence_unique").on(
      table.matchId,
      table.sequence
    ),
    foreignKey({
      name: "match_events_match_schema_version_fk",
      columns: [table.matchId, table.schemaVersionId],
      foreignColumns: [matches.id, matches.eventSchemaVersionId]
    }),
    check("match_events_value_json_valid", sql`json_valid(${table.value})`)
  ]
);

export type MatchEvent = typeof matchEvents.$inferSelect;
