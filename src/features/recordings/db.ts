import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const recordings = sqliteTable("recordings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(),
  sha256: text("sha256").notNull().unique(),
  objectKey: text("object_key").notNull().unique(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
});

export type Recording = typeof recordings.$inferSelect;
