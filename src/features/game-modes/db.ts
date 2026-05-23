import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

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
