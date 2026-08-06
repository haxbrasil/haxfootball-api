import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

export type RenderProfileState = "active" | "archived";
export type RenderCameraPreset = {
  id: string;
  title: string;
  description?: string | null;
  zoom: number;
  hudZoom: number;
  scoreboardZoom: number;
  menuZoom: number;
  locationIndicatorZoom: number;
  gameMessageZoom: number;
  rules: Array<{
    when: string;
    focus?: { target: "players" };
    set?: Record<string, number>;
  }>;
  parameters: Record<string, number>;
};
export type RenderProfileSettings = {
  formats: Array<"mp4" | "webm" | "gif">;
  orientations: Array<"landscape" | "vertical">;
  scoreboards: string[];
  cameras: RenderCameraPreset[];
};

export const renderProfileFamilies = sqliteTable(
  "render_profile_families",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .$type<RenderProfileState>()
      .default("active"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [uniqueIndex("render_profile_families_name_unique").on(table.name)]
);

export const renderProfileDrafts = sqliteTable("render_profile_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: integer("family_id")
    .notNull()
    .unique()
    .references(() => renderProfileFamilies.id),
  settings: text("settings", { mode: "json" })
    .$type<RenderProfileSettings>()
    .notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
});

export const renderProfileVersions = sqliteTable(
  "render_profile_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    familyId: integer("family_id")
      .notNull()
      .references(() => renderProfileFamilies.id),
    version: integer("version").notNull(),
    settings: text("settings", { mode: "json" })
      .$type<RenderProfileSettings>()
      .notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("render_profile_versions_family_version_unique").on(
      table.familyId,
      table.version
    )
  ]
);

export type RenderProfileFamily = typeof renderProfileFamilies.$inferSelect;
export type RenderProfileVersion = typeof renderProfileVersions.$inferSelect;
