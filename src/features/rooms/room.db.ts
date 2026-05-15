import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

export type RoomLaunchConfigValue = string | number | boolean | null;

export type RoomLaunchConfigField = {
  key: string;
  displayName: string;
  valueType: "string" | "number" | "boolean";
  required: boolean;
  defaultValue?: RoomLaunchConfigValue;
  enumValues?: string[];
  minimum?: number;
  maximum?: number;
  description?: string;
  secret: boolean;
  envVar: string;
};

export type RoomProgramReleaseSource = {
  owner: string;
  repo: string;
  assetPattern: string;
};

export type RoomProgramInstallStrategy = "none" | "npm-ci" | "npm-install";

export type RoomProgramVersionArtifact = {
  releaseId: string;
  tagName: string;
  assetName: string;
  assetUrl: string;
  publishedAt: string;
  checksumSha256?: string;
};

export type RoomLaunchConfig = Record<string, RoomLaunchConfigValue>;

export const roomPrograms = sqliteTable(
  "room_programs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    name: text("name").notNull(),
    title: text("title"),
    description: text("description"),
    releaseSource: text("release_source", { mode: "json" })
      .$type<RoomProgramReleaseSource>()
      .notNull(),
    launchConfigFields: text("launch_config_fields", { mode: "json" })
      .$type<RoomLaunchConfigField[]>()
      .notNull(),
    supportsManualLinking: integer("supports_manual_linking", {
      mode: "boolean"
    })
      .notNull()
      .$default(() => false),
    haxballTokenEnvVar: text("haxball_token_env_var")
      .notNull()
      .$default(() => "ROOM_TOKEN"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [uniqueIndex("room_programs_name_unique").on(table.name)]
);

export const roomProgramVersions = sqliteTable(
  "room_program_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    programId: integer("program_id")
      .notNull()
      .references(() => roomPrograms.id),
    version: text("version").notNull(),
    artifact: text("artifact", { mode: "json" })
      .$type<RoomProgramVersionArtifact>()
      .notNull(),
    nodeEntrypoint: text("node_entrypoint").notNull(),
    installStrategy: text("install_strategy", {
      enum: ["none", "npm-ci", "npm-install"]
    })
      .notNull()
      .$default(() => "npm-ci"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("room_program_versions_program_id_version_unique").on(
      table.programId,
      table.version
    )
  ]
);

export const roomProgramVersionAliases = sqliteTable(
  "room_program_version_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    programId: integer("program_id")
      .notNull()
      .references(() => roomPrograms.id),
    alias: text("alias").notNull(),
    versionId: integer("version_id")
      .notNull()
      .references(() => roomProgramVersions.id),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("room_program_version_aliases_program_id_alias_unique").on(
      table.programId,
      table.alias
    )
  ]
);

export const roomProxyEndpoints = sqliteTable(
  "room_proxy_endpoints",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    key: text("key").notNull(),
    displayName: text("display_name").notNull(),
    outboundIp: text("outbound_ip").notNull(),
    proxyUrl: text("proxy_url").notNull(),
    enabled: integer("enabled", { mode: "boolean" })
      .notNull()
      .$default(() => true),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [uniqueIndex("room_proxy_endpoints_key_unique").on(table.key)]
);

export const roomInstances = sqliteTable("room_instances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uuid: text("uuid").notNull().unique(),
  programId: integer("program_id")
    .notNull()
    .references(() => roomPrograms.id),
  versionId: integer("version_id")
    .notNull()
    .references(() => roomProgramVersions.id),
  proxyEndpointId: integer("proxy_endpoint_id").references(
    () => roomProxyEndpoints.id
  ),
  state: text("state", {
    enum: ["provisioning", "running", "closed"]
  }).notNull(),
  roomLink: text("room_link"),
  launchConfig: text("launch_config", { mode: "json" })
    .$type<RoomLaunchConfig>()
    .notNull(),
  public: integer("public", { mode: "boolean" }).notNull(),
  pid: integer("pid"),
  processStartedAt: text("process_started_at"),
  invocationId: text("invocation_id"),
  logPath: text("log_path"),
  commIdHash: text("comm_id_hash").notNull(),
  closedAt: text("closed_at"),
  exitCode: integer("exit_code"),
  exitSignal: text("exit_signal"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
});

export type RoomProgram = typeof roomPrograms.$inferSelect;
export type RoomProgramVersion = typeof roomProgramVersions.$inferSelect;
export type RoomProgramVersionAlias =
  typeof roomProgramVersionAliases.$inferSelect;
export type RoomProxyEndpoint = typeof roomProxyEndpoints.$inferSelect;
export type RoomInstance = typeof roomInstances.$inferSelect;
