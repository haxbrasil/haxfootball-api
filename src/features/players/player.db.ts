import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

export const players = sqliteTable(
  "players",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalId: text("external_id").notNull().unique(),
    identityKey: text("identity_key").notNull(),
    roomId: text("room_id").notNull(),
    roomPlayerId: integer("room_player_id").notNull(),
    auth: text("auth"),
    conn: text("conn"),
    name: text("name").notNull(),
    country: text("country"),
    accountId: integer("account_id"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [uniqueIndex("players_identity_key_unique").on(table.identityKey)]
);

export type Player = typeof players.$inferSelect;
