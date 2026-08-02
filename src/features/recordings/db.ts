import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type RecordingFormat = "hbr2" | "hbrx";

export const recordings = sqliteTable("recordings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(),
  sha256: text("sha256").notNull().unique(),
  objectKey: text("object_key").notNull().unique(),
  sizeBytes: integer("size_bytes").notNull(),
  format: text("format", { enum: ["hbr2", "hbrx"] }).$type<RecordingFormat>(),
  extensionVersion: integer("extension_version"),
  totalFrames: integer("total_frames"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
});

export type Recording = typeof recordings.$inferSelect;
