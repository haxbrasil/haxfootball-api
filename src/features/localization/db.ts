import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

export const languages = sqliteTable(
  "languages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [uniqueIndex("languages_code_unique").on(table.code)]
);

export const values = sqliteTable(
  "values",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    value: text("value").notNull(),
    languageId: integer("language_id")
      .notNull()
      .references(() => languages.id),
    label: text("label").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("values_value_language_id_unique").on(
      table.value,
      table.languageId
    )
  ]
);

export type Language = typeof languages.$inferSelect;
export type Value = typeof values.$inferSelect;
