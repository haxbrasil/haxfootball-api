import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { eventSchemaFamilies } from "@/features/event-schemas/db";

export const gameModes = sqliteTable(
  "game_modes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    title: text("title"),
    description: text("description"),
    visibility: text("visibility", { enum: ["visible", "hidden"] })
      .notNull()
      .default("visible"),
    rank: integer("rank").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [uniqueIndex("game_modes_name_unique").on(table.name)]
);

export type GameMode = typeof gameModes.$inferSelect;

export const gameModeEventSchemas = sqliteTable(
  "game_mode_event_schemas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameModeId: integer("game_mode_id")
      .notNull()
      .references(() => gameModes.id),
    eventSchemaFamilyId: integer("event_schema_family_id")
      .notNull()
      .references(() => eventSchemaFamilies.id),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("game_mode_event_schemas_unique").on(
      table.gameModeId,
      table.eventSchemaFamilyId
    ),
    index("game_mode_event_schemas_mode_idx").on(table.gameModeId, table.id)
  ]
);
