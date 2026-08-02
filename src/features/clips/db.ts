import { integer, index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { recordings } from "@/features/recordings/db";

export type ClipSourceKind = "web" | "room_command";

export const clips = sqliteTable(
  "clips",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull().unique(),
    recordingId: integer("recording_id")
      .notNull()
      .references(() => recordings.id),
    startTick: integer("start_tick").notNull(),
    endTick: integer("end_tick").notNull(),
    title: text("title"),
    sourceKind: text("source_kind", {
      enum: ["web", "room_command"]
    })
      .notNull()
      .$type<ClipSourceKind>(),
    archivedAt: text("archived_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [index("clips_recording_idx").on(table.recordingId, table.id)]
);

export type Clip = typeof clips.$inferSelect;
