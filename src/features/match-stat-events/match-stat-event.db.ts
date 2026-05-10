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
import { matches } from "@/features/matches/match.db";
import { players } from "@/features/players/player.db";
import { statEventSchemaVersions } from "@/features/stat-event-schemas/stat-event-schema.db";
import type { JsonValue } from "@lib";

export const matchStatEvents = sqliteTable(
  "match_stat_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    matchId: integer("match_id").notNull(),
    schemaVersionId: integer("schema_version_id")
      .notNull()
      .references(() => statEventSchemaVersions.id),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    value: text("value", { mode: "json" }).$type<JsonValue>(),
    occurredAt: text("occurred_at"),
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
    uniqueIndex("match_stat_events_match_id_sequence_unique").on(
      table.matchId,
      table.sequence
    ),
    foreignKey({
      name: "match_stat_events_match_schema_version_fk",
      columns: [table.matchId, table.schemaVersionId],
      foreignColumns: [matches.id, matches.statEventSchemaVersionId]
    }),
    check("match_stat_events_value_json_valid", sql`json_valid(${table.value})`)
  ]
);

export type MatchStatEvent = typeof matchStatEvents.$inferSelect;
