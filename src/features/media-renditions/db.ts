import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { clips } from "@/features/clips/db";

export type MediaRenditionSourceKind = "clip";
export type MediaRenditionPurpose = "clip_poster" | "clip_preview_video";
export type MediaRenditionStatus = "queued" | "running" | "ready" | "failed";

export const mediaRenditions = sqliteTable(
  "media_renditions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    sourceKind: text("source_kind", { enum: ["clip"] })
      .notNull()
      .$type<MediaRenditionSourceKind>(),
    clipId: integer("clip_id")
      .notNull()
      .references(() => clips.id),
    sourceFingerprint: text("source_fingerprint").notNull(),
    purpose: text("purpose", {
      enum: ["clip_poster", "clip_preview_video"]
    })
      .notNull()
      .$type<MediaRenditionPurpose>(),
    cacheKey: text("cache_key").notNull(),
    profileVersion: text("profile_version").notNull(),
    status: text("status", {
      enum: ["queued", "running", "ready", "failed"]
    })
      .notNull()
      .$type<MediaRenditionStatus>(),
    objectKey: text("object_key"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    checksumSha256: text("checksum_sha256"),
    width: integer("width"),
    height: integer("height"),
    durationTicks: integer("duration_ticks"),
    rendererVersion: text("renderer_version"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("media_renditions_cache_key_unique").on(table.cacheKey),
    index("media_renditions_clip_idx").on(table.clipId, table.purpose)
  ]
);

export type MediaRendition = typeof mediaRenditions.$inferSelect;
