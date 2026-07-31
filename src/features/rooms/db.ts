import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import type { JsonValue } from "@lib";
import { matches } from "@/features/matches/db";
import { players } from "@/features/players/db";
import { roomInstances } from "@/features/rooms/core-db";

export * from "@/features/rooms/core-db";

export type RoomInstanceIncidentKind =
  | "desync"
  | "uncaught-exception"
  | "unhandled-rejection";
export type RoomCommandStatus = "queued" | "sent" | "acknowledged" | "failed";

export const roomInstanceEvents = sqliteTable(
  "room_instance_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    roomInstanceId: integer("room_instance_id").notNull(),
    matchId: integer("match_id").references(() => matches.id),
    sequence: integer("sequence").notNull(),
    domain: text("domain", {
      enum: ["room", "game", "agent", "system"]
    }).notNull(),
    type: text("type").notNull(),
    scope: text("scope", {
      enum: ["player", "team", "match"]
    }).notNull(),
    actorPlayerId: integer("actor_player_id").references(() => players.id),
    subjectPlayerId: integer("subject_player_id").references(() => players.id),
    team: text("team", { enum: ["spectators", "red", "blue"] }),
    roomPlayerId: integer("room_player_id"),
    playId: text("play_id"),
    sourceState: text("source_state"),
    value: text("value", { mode: "json" }).$type<JsonValue>(),
    occurredAt: text("occurred_at"),
    elapsedSeconds: real("elapsed_seconds"),
    tick: real("tick"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("room_instance_events_room_sequence_unique").on(
      table.roomInstanceId,
      table.sequence
    ),
    foreignKey({
      name: "room_instance_events_room_instance_fk",
      columns: [table.roomInstanceId],
      foreignColumns: [roomInstances.id]
    }),
    check(
      "room_instance_events_value_json_valid",
      sql`json_valid(${table.value})`
    )
  ]
);

export const roomInstanceIncidents = sqliteTable(
  "room_instance_incidents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    roomInstanceId: integer("room_instance_id").notNull(),
    kind: text("kind", {
      enum: ["desync", "uncaught-exception", "unhandled-rejection"]
    }).notNull(),
    objectKey: text("object_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    playerId: integer("player_id"),
    tick: real("tick"),
    reason: text("reason"),
    occurredAt: text("occurred_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    foreignKey({
      name: "room_instance_incidents_room_instance_fk",
      columns: [table.roomInstanceId],
      foreignColumns: [roomInstances.id]
    })
  ]
);

export const roomCommands = sqliteTable("room_commands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uuid: text("uuid").notNull().unique(),
  roomId: integer("room_id")
    .notNull()
    .references(() => roomInstances.id),
  name: text("name").notNull(),
  payload: text("payload", { mode: "json" }).$type<JsonValue>(),
  status: text("status", {
    enum: ["queued", "sent", "acknowledged", "failed"]
  })
    .notNull()
    .$default(() => "queued"),
  result: text("result", { mode: "json" }).$type<JsonValue | null>(),
  error: text("error"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  sentAt: text("sent_at"),
  completedAt: text("completed_at")
});

export type RoomInstanceEvent = typeof roomInstanceEvents.$inferSelect;
export type RoomInstanceIncident = typeof roomInstanceIncidents.$inferSelect;
export type RoomCommand = typeof roomCommands.$inferSelect;
