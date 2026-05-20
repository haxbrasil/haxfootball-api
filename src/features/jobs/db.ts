import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import type { JsonValue } from "@lib/json";

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uuid: text("uuid").notNull().unique(),
  type: text("type").notNull(),
  status: text("status", {
    enum: ["queued", "running", "succeeded", "failed", "canceled"]
  }).notNull(),
  payload: text("payload", { mode: "json" }).$type<JsonValue>(),
  result: text("result", { mode: "json" }).$type<JsonValue>(),
  error: text("error", { mode: "json" }).$type<JsonValue>(),
  attempts: integer("attempts")
    .notNull()
    .$default(() => 0),
  maxAttempts: integer("max_attempts")
    .notNull()
    .$default(() => 3),
  runAfter: text("run_after").notNull(),
  lockedAt: text("locked_at"),
  lockedBy: text("locked_by"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
});

export const jobSchedules = sqliteTable(
  "job_schedules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid").notNull().unique(),
    key: text("key").notNull(),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).$type<JsonValue>(),
    intervalSeconds: integer("interval_seconds").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    nextRunAt: text("next_run_at").notNull(),
    lastEnqueuedAt: text("last_enqueued_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [uniqueIndex("job_schedules_key_unique").on(table.key)]
);

export type Job = typeof jobs.$inferSelect;
export type JobSchedule = typeof jobSchedules.$inferSelect;
