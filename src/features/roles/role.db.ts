import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const defaultRoleId = 1;
export const defaultRoleUuid = "00000000-0000-4000-8000-000000000001";
export const defaultRoleName = "default";

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uuid: text("uuid")
    .notNull()
    .unique()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  isDefault: integer("is_default", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
});

export type Role = typeof roles.$inferSelect;
