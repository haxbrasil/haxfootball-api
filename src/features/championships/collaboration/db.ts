import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { accounts } from "@/features/accounts/db";
import {
  championshipAuditEvents,
  championships
} from "@/features/championships/core/db";

export const championshipThreads = sqliteTable(
  "championship_threads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    contextType: text("context_type").notNull(),
    contextUuid: text("context_uuid"),
    title: text("title"),
    state: text("state", { enum: ["open", "resolved"] })
      .notNull()
      .default("open"),
    createdByAccountId: integer("created_by_account_id")
      .notNull()
      .references(() => accounts.id),
    resolvedByAccountId: integer("resolved_by_account_id").references(
      () => accounts.id
    ),
    resolvedAt: text("resolved_at"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_threads_context_state_idx").on(
      table.championshipId,
      table.contextType,
      table.contextUuid,
      table.state,
      table.id
    )
  ]
);

export const championshipComments = sqliteTable(
  "championship_comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    threadId: integer("thread_id")
      .notNull()
      .references(() => championshipThreads.id),
    authorAccountId: integer("author_account_id")
      .notNull()
      .references(() => accounts.id),
    body: text("body").notNull(),
    revision: integer("revision").notNull().default(0),
    editedAt: text("edited_at"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_comments_thread_id_idx").on(table.threadId, table.id)
  ]
);

export const championshipCommentMentions = sqliteTable(
  "championship_comment_mentions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    commentId: integer("comment_id")
      .notNull()
      .references(() => championshipComments.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_comment_mentions_unique").on(
      table.commentId,
      table.accountId
    ),
    index("championship_comment_mentions_account_idx").on(
      table.accountId,
      table.id
    )
  ]
);

export const championshipAssignments = sqliteTable(
  "championship_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    contextType: text("context_type").notNull(),
    contextUuid: text("context_uuid"),
    title: text("title").notNull(),
    description: text("description"),
    assigneeAccountId: integer("assignee_account_id")
      .notNull()
      .references(() => accounts.id),
    assignedByAccountId: integer("assigned_by_account_id")
      .notNull()
      .references(() => accounts.id),
    state: text("state", {
      enum: ["open", "in-progress", "completed", "canceled"]
    })
      .notNull()
      .default("open"),
    dueAt: text("due_at"),
    completedAt: text("completed_at"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_assignments_assignee_state_idx").on(
      table.assigneeAccountId,
      table.state,
      table.id
    ),
    index("championship_assignments_context_idx").on(
      table.championshipId,
      table.contextType,
      table.contextUuid,
      table.id
    )
  ]
);

export const championshipInboxItems = sqliteTable(
  "championship_inbox_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    kind: text("kind", {
      enum: [
        "mention",
        "assignment",
        "conflict",
        "schedule",
        "draft",
        "result",
        "system"
      ]
    }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    contextType: text("context_type"),
    contextUuid: text("context_uuid"),
    auditEventId: integer("audit_event_id").references(
      () => championshipAuditEvents.id
    ),
    dedupeKey: text("dedupe_key"),
    readAt: text("read_at"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_inbox_dedupe_unique").on(
      table.accountId,
      table.dedupeKey
    ),
    index("championship_inbox_account_unread_idx").on(
      table.accountId,
      table.readAt,
      table.id
    )
  ]
);

export const championshipPresence = sqliteTable(
  "championship_presence",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    sessionUuid: text("session_uuid").notNull(),
    contextType: text("context_type"),
    contextUuid: text("context_uuid"),
    display: text("display", { mode: "json" }).$type<Record<string, unknown>>(),
    expiresAt: text("expires_at").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_presence_session_unique").on(
      table.championshipId,
      table.accountId,
      table.sessionUuid
    ),
    index("championship_presence_expiry_idx").on(
      table.championshipId,
      table.expiresAt,
      table.id
    )
  ]
);

export const championshipSavedViews = sqliteTable(
  "championship_saved_views",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    surface: text("surface").notNull(),
    name: text("name").notNull(),
    state: text("state", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_saved_views_name_unique").on(
      table.championshipId,
      table.accountId,
      table.surface,
      table.name
    )
  ]
);

export type ChampionshipThread = typeof championshipThreads.$inferSelect;
export type ChampionshipComment = typeof championshipComments.$inferSelect;
export type ChampionshipAssignment =
  typeof championshipAssignments.$inferSelect;
