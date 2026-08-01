import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { championships } from "@/features/championships/core/db";
import { eventSchemaFamilies } from "@/features/event-schemas/db";
import { gameModes } from "@/features/game-modes/db";

export type VisualizationScope = "match" | "championship";
export type VisualizationChartType =
  | "bar"
  | "line"
  | "area"
  | "scatter"
  | "bubble"
  | "pie"
  | "donut"
  | "radar"
  | "heatmap"
  | "boxplot"
  | "funnel"
  | "gauge"
  | "treemap"
  | "sunburst"
  | "sankey"
  | "graph"
  | "tree"
  | "parallel"
  | "calendar";
export type VisualizationChart = {
  type: VisualizationChartType;
  datasetId: string;
  fields: Record<string, string | string[]>;
  settings?: Record<string, unknown>;
};
export type VisualizationSpec = {
  datasets: Array<{
    id: string;
    source: string;
    operations?: unknown[];
  }>;
  option: Record<string, unknown>;
  chart?: VisualizationChart;
  interactions?: Record<string, unknown>;
  accessibility?: { summary?: string; table?: boolean };
};

export const visualizationTemplateFamilies = sqliteTable(
  "visualization_template_families",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    scope: text("scope", { enum: ["match", "championship"] }).notNull(),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    internalNotes: text("internal_notes"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("visualization_template_families_name_unique").on(table.name)
  ]
);

export const visualizationTemplateDrafts = sqliteTable(
  "visualization_template_drafts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    familyId: integer("family_id")
      .notNull()
      .unique()
      .references(() => visualizationTemplateFamilies.id),
    specification: text("specification", { mode: "json" })
      .$type<VisualizationSpec>()
      .notNull(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    scope: text("scope", { enum: ["match", "championship"] }).notNull(),
    revision: integer("revision").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  }
);

export const visualizationTemplateVersions = sqliteTable(
  "visualization_template_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    familyId: integer("family_id")
      .notNull()
      .references(() => visualizationTemplateFamilies.id),
    version: integer("version").notNull(),
    specification: text("specification", { mode: "json" })
      .$type<VisualizationSpec>()
      .notNull(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    scope: text("scope", { enum: ["match", "championship"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("visualization_template_versions_unique").on(
      table.familyId,
      table.version
    )
  ]
);

export const visualizationTemplateCompatibilities = sqliteTable(
  "visualization_template_compatibilities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    familyId: integer("family_id")
      .notNull()
      .references(() => visualizationTemplateFamilies.id),
    gameModeId: integer("game_mode_id").references(() => gameModes.id),
    eventSchemaFamilyId: integer("event_schema_family_id").references(
      () => eventSchemaFamilies.id
    ),
    requiredMetrics: text("required_metrics", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([])
  },
  (table) => [
    index("visualization_template_compat_family_idx").on(
      table.familyId,
      table.id
    )
  ]
);

export const championshipVisualizationInstances = sqliteTable(
  "championship_visualization_instances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    templateVersionId: integer("template_version_id")
      .notNull()
      .references(() => visualizationTemplateVersions.id),
    surface: text("surface", { enum: ["overview", "statistics"] }).notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    width: text("width", { enum: ["compact", "half", "full"] })
      .notNull()
      .default("half"),
    height: text("height", { enum: ["short", "medium", "tall", "viewport"] })
      .notNull()
      .default("medium"),
    titleOverride: text("title_override"),
    overrides: text("overrides", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    visibility: text("visibility", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_visualizations_surface_idx").on(
      table.championshipId,
      table.surface,
      table.displayOrder
    )
  ]
);

export const visualizationAuditEvents = sqliteTable(
  "visualization_audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    familyId: integer("family_id").references(
      () => visualizationTemplateFamilies.id
    ),
    championshipId: integer("championship_id").references(
      () => championships.id
    ),
    action: text("action").notNull(),
    actorAccountUuid: text("actor_account_uuid"),
    before: text("before", { mode: "json" }).$type<unknown>(),
    after: text("after", { mode: "json" }).$type<unknown>(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  }
);
