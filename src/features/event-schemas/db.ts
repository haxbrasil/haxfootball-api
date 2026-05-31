import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import type { EventSchemaDefinition } from "@/features/event-schemas/definition";

export const eventSchemaFamilies = sqliteTable(
  "event_schema_families",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    name: text("name").notNull(),
    title: text("title"),
    description: text("description"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [uniqueIndex("event_schema_families_name_unique").on(table.name)]
);

export const eventSchemaVersions = sqliteTable(
  "event_schema_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    familyId: integer("family_id")
      .notNull()
      .references(() => eventSchemaFamilies.id),
    version: integer("version").notNull(),
    definition: text("definition", { mode: "json" })
      .$type<EventSchemaDefinition>()
      .notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("event_schema_versions_family_id_version_unique").on(
      table.familyId,
      table.version
    )
  ]
);

export type EventSchemaFamily = typeof eventSchemaFamilies.$inferSelect;
export type EventSchemaVersion = typeof eventSchemaVersions.$inferSelect;
