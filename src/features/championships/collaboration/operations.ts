import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, type DbTransaction, withDatabaseTransaction } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import {
  championshipAssignments,
  championshipCommentMentions,
  championshipComments,
  championshipInboxItems,
  championshipPresence,
  championshipSavedViews,
  championshipThreads
} from "@/features/championships/collaboration/db";
import { championships } from "@/features/championships/core/db";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  type AddChampionshipCommentInput,
  type ChampionshipCollaborationQuery,
  type ChampionshipInboxQuery,
  type ChampionshipPresenceInput,
  type ChampionshipSavedViewsQuery,
  type CreateChampionshipAssignmentInput,
  type CreateChampionshipThreadInput,
  type UpdateChampionshipAssignmentInput,
  type UpdateChampionshipThreadInput,
  type UpdateChampionshipInboxItemInput,
  type UpsertChampionshipSavedViewInput
} from "@/features/championships/_shared/http/inputs";
import {
  type ChampionshipAssignmentResponse,
  type ChampionshipCommentResponse,
  type ChampionshipInboxItemResponse,
  type ChampionshipPresenceResponse,
  type ChampionshipSavedViewResponse,
  type ChampionshipThreadResponse
} from "@/features/championships/_shared/http/responses";
import { badRequest, notFound } from "@/shared/http/errors";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse
} from "@lib";

const presenceLifetimeMs = 45_000;

export async function createChampionshipThread(
  championshipUuid: string,
  input: CreateChampionshipThreadInput
): Promise<ChampionshipThreadResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "thread.created"
    },
    async (tx, championship, actor) => {
      const mentionedAccounts = await resolveMentionAccounts(
        tx,
        input.mentionAccountUuids ?? []
      );
      const [thread] = await tx
        .insert(championshipThreads)
        .values({
          championshipId: championship.id,
          contextType: input.contextType,
          contextUuid: input.contextUuid ?? null,
          title: input.title ?? null,
          createdByAccountId: actor.account.id,
          revision: 1
        })
        .returning();
      const [comment] = await tx
        .insert(championshipComments)
        .values({
          threadId: thread.id,
          authorAccountId: actor.account.id,
          body: input.body
        })
        .returning();

      await createMentionsAndInbox(tx, {
        championshipId: championship.id,
        championshipUuid: championship.uuid,
        threadUuid: thread.uuid,
        commentId: comment.id,
        commentUuid: comment.uuid,
        authorName: actor.account.name,
        accounts: mentionedAccounts
      });

      const response = await getThreadResponse(tx, thread.uuid);

      return {
        response: () => response,
        targetType: "thread",
        targetUuid: thread.uuid,
        before: null,
        after: response
      };
    }
  );
}

export async function addChampionshipComment(
  championshipUuid: string,
  threadUuid: string,
  input: AddChampionshipCommentInput
): Promise<ChampionshipCommentResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "comment.created"
    },
    async (tx, championship, actor) => {
      const thread = await findThread(tx, championship.id, threadUuid);
      const mentionedAccounts = await resolveMentionAccounts(
        tx,
        input.mentionAccountUuids ?? []
      );
      const [comment] = await tx
        .insert(championshipComments)
        .values({
          threadId: thread.id,
          authorAccountId: actor.account.id,
          body: input.body
        })
        .returning();

      await tx
        .update(championshipThreads)
        .set({
          revision: thread.revision + 1,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championshipThreads.id, thread.id));
      await createMentionsAndInbox(tx, {
        championshipId: championship.id,
        championshipUuid: championship.uuid,
        threadUuid: thread.uuid,
        commentId: comment.id,
        commentUuid: comment.uuid,
        authorName: actor.account.name,
        accounts: mentionedAccounts
      });

      const response = await getCommentResponse(tx, comment.uuid);

      return {
        response: () => response,
        targetType: "comment",
        targetUuid: comment.uuid,
        before: null,
        after: response,
        metadata: {
          threadUuid
        }
      };
    }
  );
}

export async function updateChampionshipThread(
  championshipUuid: string,
  threadUuid: string,
  input: UpdateChampionshipThreadInput
): Promise<ChampionshipThreadResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: `thread.${input.state}`
    },
    async (tx, championship, actor) => {
      const thread = await findThread(tx, championship.id, threadUuid);

      if (thread.state === input.state) {
        throw badRequest(`Thread is already ${input.state}`);
      }

      await tx
        .update(championshipThreads)
        .set({
          state: input.state,
          resolvedByAccountId:
            input.state === "resolved" ? actor.account.id : null,
          resolvedAt:
            input.state === "resolved" ? new Date().toISOString() : null,
          revision: thread.revision + 1,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championshipThreads.id, thread.id));
      const response = await getThreadResponse(tx, thread.uuid);

      return {
        response: () => response,
        targetType: "thread",
        targetUuid: thread.uuid,
        before: thread,
        after: response
      };
    }
  );
}

export async function listChampionshipThreads(
  championshipUuid: string,
  query: ChampionshipCollaborationQuery
): Promise<PaginatedResponse<ChampionshipThreadResponse>> {
  return withDatabaseTransaction(async (tx) => {
    const championship = await requireCollaborationAccess(
      tx,
      championshipUuid,
      query.actorAccountUuid
    );
    const cursor = decodeCursor<number>(query.cursor);
    const conditions = [
      eq(championshipThreads.championshipId, championship.id),
      cursor === undefined ? undefined : gt(championshipThreads.id, cursor),
      query.contextType
        ? eq(championshipThreads.contextType, query.contextType)
        : undefined,
      query.contextUuid
        ? eq(championshipThreads.contextUuid, query.contextUuid)
        : undefined,
      query.state ? eq(championshipThreads.state, query.state) : undefined
    ].filter((condition) => condition !== undefined);
    const rows = await tx
      .select({ id: championshipThreads.id, uuid: championshipThreads.uuid })
      .from(championshipThreads)
      .where(and(...conditions))
      .orderBy(asc(championshipThreads.id))
      .limit(pageLimit(query));
    const page = pageItems(rows, query, (row) => row.id);
    const items: ChampionshipThreadResponse[] = [];

    for (const row of page.items) {
      items.push(await getThreadResponse(tx, row.uuid));
    }

    return {
      items,
      page: page.page
    };
  });
}

export async function listChampionshipComments(
  championshipUuid: string,
  threadUuid: string,
  query: ChampionshipCollaborationQuery
): Promise<PaginatedResponse<ChampionshipCommentResponse>> {
  return withDatabaseTransaction(async (tx) => {
    const championship = await requireCollaborationAccess(
      tx,
      championshipUuid,
      query.actorAccountUuid
    );
    const thread = await findThread(tx, championship.id, threadUuid);
    const cursor = decodeCursor<number>(query.cursor);
    const rows = await tx
      .select({ id: championshipComments.id, uuid: championshipComments.uuid })
      .from(championshipComments)
      .where(
        and(
          eq(championshipComments.threadId, thread.id),
          isNull(championshipComments.deletedAt),
          cursor === undefined ? undefined : gt(championshipComments.id, cursor)
        )
      )
      .orderBy(asc(championshipComments.id))
      .limit(pageLimit(query));
    const page = pageItems(rows, query, (row) => row.id);
    const items: ChampionshipCommentResponse[] = [];

    for (const row of page.items) {
      items.push(await getCommentResponse(tx, row.uuid));
    }

    return {
      items,
      page: page.page
    };
  });
}

export async function createChampionshipAssignment(
  championshipUuid: string,
  input: CreateChampionshipAssignmentInput
): Promise<ChampionshipAssignmentResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "assignment.created"
    },
    async (tx, championship, actor) => {
      const assignee = await findAccount(tx, input.assigneeAccountUuid);
      const [assignment] = await tx
        .insert(championshipAssignments)
        .values({
          championshipId: championship.id,
          contextType: input.contextType,
          contextUuid: input.contextUuid ?? null,
          title: input.title,
          description: input.description ?? null,
          assigneeAccountId: assignee.id,
          assignedByAccountId: actor.account.id,
          dueAt: input.dueAt ?? null,
          revision: 1
        })
        .returning();

      await tx.insert(championshipInboxItems).values({
        accountId: assignee.id,
        championshipId: championship.id,
        kind: "assignment",
        title: input.title,
        body: input.description ?? null,
        contextType: input.contextType,
        contextUuid: input.contextUuid ?? assignment.uuid,
        dedupeKey: `assignment:${assignment.uuid}`
      });
      const response = await getAssignmentResponse(tx, assignment.uuid);

      return {
        response: () => response,
        targetType: "assignment",
        targetUuid: assignment.uuid,
        before: null,
        after: response
      };
    }
  );
}

export async function updateChampionshipAssignment(
  championshipUuid: string,
  assignmentUuid: string,
  input: UpdateChampionshipAssignmentInput
): Promise<ChampionshipAssignmentResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: `assignment.${input.state}`
    },
    async (tx, championship) => {
      const [assignment] = await tx
        .select()
        .from(championshipAssignments)
        .where(
          and(
            eq(championshipAssignments.uuid, assignmentUuid),
            eq(championshipAssignments.championshipId, championship.id)
          )
        );

      if (!assignment) {
        throw notFound("Championship assignment not found");
      }

      await tx
        .update(championshipAssignments)
        .set({
          state: input.state,
          completedAt:
            input.state === "completed" ? new Date().toISOString() : null,
          revision: assignment.revision + 1,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championshipAssignments.id, assignment.id));
      const response = await getAssignmentResponse(tx, assignment.uuid);

      return {
        response: () => response,
        targetType: "assignment",
        targetUuid: assignment.uuid,
        before: assignment,
        after: response,
        reason: input.reason ?? null
      };
    }
  );
}

export async function listChampionshipAssignments(
  championshipUuid: string,
  query: ChampionshipCollaborationQuery
): Promise<PaginatedResponse<ChampionshipAssignmentResponse>> {
  return withDatabaseTransaction(async (tx) => {
    const championship = await requireCollaborationAccess(
      tx,
      championshipUuid,
      query.actorAccountUuid
    );
    const cursor = decodeCursor<number>(query.cursor);
    const rows = await tx
      .select({
        id: championshipAssignments.id,
        uuid: championshipAssignments.uuid
      })
      .from(championshipAssignments)
      .where(
        and(
          eq(championshipAssignments.championshipId, championship.id),
          cursor === undefined
            ? undefined
            : gt(championshipAssignments.id, cursor),
          query.contextType
            ? eq(championshipAssignments.contextType, query.contextType)
            : undefined,
          query.contextUuid
            ? eq(championshipAssignments.contextUuid, query.contextUuid)
            : undefined
        )
      )
      .orderBy(asc(championshipAssignments.id))
      .limit(pageLimit(query));
    const page = pageItems(rows, query, (row) => row.id);
    const items: ChampionshipAssignmentResponse[] = [];

    for (const row of page.items) {
      items.push(await getAssignmentResponse(tx, row.uuid));
    }

    return { items, page: page.page };
  });
}

export async function heartbeatChampionshipPresence(
  championshipUuid: string,
  input: ChampionshipPresenceInput
): Promise<ChampionshipPresenceResponse[]> {
  return withDatabaseTransaction(async (tx) => {
    const championship = await requireCollaborationAccess(
      tx,
      championshipUuid,
      input.actorAccountUuid
    );
    const actor = await findAccount(tx, input.actorAccountUuid);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + presenceLifetimeMs
    ).toISOString();

    await tx
      .delete(championshipPresence)
      .where(
        and(
          eq(championshipPresence.championshipId, championship.id),
          lt(championshipPresence.expiresAt, now.toISOString())
        )
      );
    await tx
      .insert(championshipPresence)
      .values({
        championshipId: championship.id,
        accountId: actor.id,
        sessionUuid: input.sessionUuid,
        contextType: input.contextType ?? null,
        contextUuid: input.contextUuid ?? null,
        expiresAt
      })
      .onConflictDoUpdate({
        target: [
          championshipPresence.championshipId,
          championshipPresence.accountId,
          championshipPresence.sessionUuid
        ],
        set: {
          contextType: input.contextType ?? null,
          contextUuid: input.contextUuid ?? null,
          expiresAt,
          updatedAt: now.toISOString()
        }
      });

    return listActivePresence(tx, championship.id, now.toISOString());
  });
}

export async function listChampionshipPresence(
  championshipUuid: string,
  actorAccountUuid: string
): Promise<ChampionshipPresenceResponse[]> {
  return withDatabaseTransaction(async (tx) => {
    const championship = await requireCollaborationAccess(
      tx,
      championshipUuid,
      actorAccountUuid
    );

    return listActivePresence(tx, championship.id, new Date().toISOString());
  });
}

export async function listChampionshipInbox(
  query: ChampionshipInboxQuery
): Promise<PaginatedResponse<ChampionshipInboxItemResponse>> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.uuid, query.actorAccountUuid));

  if (!account) {
    throw notFound("Actor account not found");
  }

  const cursor = decodeCursor<number>(query.cursor);
  const rows = await db
    .select({
      item: championshipInboxItems,
      championship: championships
    })
    .from(championshipInboxItems)
    .innerJoin(
      championships,
      eq(championshipInboxItems.championshipId, championships.id)
    )
    .where(
      and(
        eq(championshipInboxItems.accountId, account.id),
        isNull(championshipInboxItems.archivedAt),
        query.unreadOnly ? isNull(championshipInboxItems.readAt) : undefined,
        cursor === undefined ? undefined : gt(championshipInboxItems.id, cursor)
      )
    )
    .orderBy(asc(championshipInboxItems.id))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, ({ item }) => item.id);

  return {
    items: page.items.map(toInboxItemResponse),
    page: page.page
  };
}

export async function updateChampionshipInboxItem(
  inboxItemUuid: string,
  input: UpdateChampionshipInboxItemInput
): Promise<ChampionshipInboxItemResponse> {
  return withDatabaseTransaction(async (tx) => {
    const account = await findAccount(tx, input.actorAccountUuid);
    const [row] = await tx
      .select({
        item: championshipInboxItems,
        championship: championships
      })
      .from(championshipInboxItems)
      .innerJoin(
        championships,
        eq(championshipInboxItems.championshipId, championships.id)
      )
      .where(
        and(
          eq(championshipInboxItems.uuid, inboxItemUuid),
          eq(championshipInboxItems.accountId, account.id)
        )
      );

    if (!row) {
      throw notFound("Championship inbox item not found");
    }

    const now = new Date().toISOString();

    await tx
      .update(championshipInboxItems)
      .set(
        input.operation === "archive"
          ? { archivedAt: now }
          : { readAt: input.operation === "read" ? now : null }
      )
      .where(eq(championshipInboxItems.id, row.item.id));

    return toInboxItemResponse({
      item: {
        ...row.item,
        readAt:
          input.operation === "read"
            ? now
            : input.operation === "unread"
              ? null
              : row.item.readAt
      },
      championship: row.championship
    });
  });
}

export async function listChampionshipSavedViews(
  championshipUuid: string,
  query: ChampionshipSavedViewsQuery
): Promise<PaginatedResponse<ChampionshipSavedViewResponse>> {
  return withDatabaseTransaction(async (tx) => {
    const championship = await requireCollaborationAccess(
      tx,
      championshipUuid,
      query.actorAccountUuid
    );
    const account = await findAccount(tx, query.actorAccountUuid);
    const cursor = decodeCursor<number>(query.cursor);
    const rows = await tx
      .select()
      .from(championshipSavedViews)
      .where(
        and(
          eq(championshipSavedViews.championshipId, championship.id),
          eq(championshipSavedViews.accountId, account.id),
          query.surface
            ? eq(championshipSavedViews.surface, query.surface)
            : undefined,
          cursor === undefined
            ? undefined
            : gt(championshipSavedViews.id, cursor)
        )
      )
      .orderBy(asc(championshipSavedViews.id))
      .limit(pageLimit(query));
    const page = pageItems(rows, query, (row) => row.id);

    return {
      items: page.items.map(toSavedViewResponse),
      page: page.page
    };
  });
}

export async function upsertChampionshipSavedView(
  championshipUuid: string,
  input: UpsertChampionshipSavedViewInput
): Promise<ChampionshipSavedViewResponse> {
  return withDatabaseTransaction(async (tx) => {
    const championship = await requireCollaborationAccess(
      tx,
      championshipUuid,
      input.actorAccountUuid
    );
    const account = await findAccount(tx, input.actorAccountUuid);
    const now = new Date().toISOString();

    if (input.isDefault) {
      await tx
        .update(championshipSavedViews)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(championshipSavedViews.championshipId, championship.id),
            eq(championshipSavedViews.accountId, account.id),
            eq(championshipSavedViews.surface, input.surface),
            eq(championshipSavedViews.isDefault, true)
          )
        );
    }

    await tx
      .insert(championshipSavedViews)
      .values({
        championshipId: championship.id,
        accountId: account.id,
        surface: input.surface,
        name: input.name,
        state: input.state,
        isDefault: input.isDefault ?? false,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [
          championshipSavedViews.championshipId,
          championshipSavedViews.accountId,
          championshipSavedViews.surface,
          championshipSavedViews.name
        ],
        set: {
          state: input.state,
          isDefault: input.isDefault ?? false,
          updatedAt: now
        }
      });
    const [savedView] = await tx
      .select()
      .from(championshipSavedViews)
      .where(
        and(
          eq(championshipSavedViews.championshipId, championship.id),
          eq(championshipSavedViews.accountId, account.id),
          eq(championshipSavedViews.surface, input.surface),
          eq(championshipSavedViews.name, input.name)
        )
      );

    if (!savedView) {
      throw notFound("Championship saved view not found");
    }

    return toSavedViewResponse(savedView);
  });
}

function toInboxItemResponse({
  item,
  championship
}: {
  item: typeof championshipInboxItems.$inferSelect;
  championship: typeof championships.$inferSelect;
}): ChampionshipInboxItemResponse {
  return {
    uuid: item.uuid,
    championshipUuid: championship.uuid,
    championshipName: championship.name,
    kind: item.kind,
    title: item.title,
    body: item.body,
    contextType: item.contextType,
    contextUuid: item.contextUuid,
    readAt: item.readAt,
    createdAt: item.createdAt
  };
}

function toSavedViewResponse(
  row: typeof championshipSavedViews.$inferSelect
): ChampionshipSavedViewResponse {
  return {
    uuid: row.uuid,
    surface: row.surface,
    name: row.name,
    state: row.state,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function requireCollaborationAccess(
  database: DbTransaction,
  championshipUuid: string,
  actorAccountUuid: string
) {
  const [championship] = await database
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  await requireChampionshipActor(database, {
    actorAccountUuid,
    permission: ["championship:admin", "championship:operate"],
    championshipId: championship.id
  });

  return championship;
}

async function findThread(
  database: DbTransaction,
  championshipId: number,
  threadUuid: string
) {
  const [thread] = await database
    .select()
    .from(championshipThreads)
    .where(
      and(
        eq(championshipThreads.uuid, threadUuid),
        eq(championshipThreads.championshipId, championshipId)
      )
    );

  if (!thread) {
    throw notFound("Championship thread not found");
  }

  return thread;
}

async function findAccount(database: DbTransaction, uuid: string) {
  const [account] = await database
    .select()
    .from(accounts)
    .where(eq(accounts.uuid, uuid));

  if (!account) {
    throw notFound("Account not found");
  }

  return account;
}

async function resolveMentionAccounts(
  database: DbTransaction,
  uuids: string[]
) {
  if (uuids.length === 0) {
    return [];
  }

  const rows = await database
    .select()
    .from(accounts)
    .where(inArray(accounts.uuid, uuids));

  if (rows.length !== uuids.length) {
    throw badRequest("One or more mentioned accounts were not found");
  }

  return rows;
}

async function createMentionsAndInbox(
  database: DbTransaction,
  input: {
    championshipId: number;
    championshipUuid: string;
    threadUuid: string;
    commentId: number;
    commentUuid: string;
    authorName: string;
    accounts: Awaited<ReturnType<typeof resolveMentionAccounts>>;
  }
) {
  if (input.accounts.length === 0) {
    return;
  }

  await database.insert(championshipCommentMentions).values(
    input.accounts.map((account) => ({
      commentId: input.commentId,
      accountId: account.id
    }))
  );
  await database.insert(championshipInboxItems).values(
    input.accounts.map((account) => ({
      accountId: account.id,
      championshipId: input.championshipId,
      kind: "mention" as const,
      title: `${input.authorName} mentioned you`,
      contextType: "thread",
      contextUuid: input.threadUuid,
      dedupeKey: `mention:${input.commentUuid}:${account.uuid}`
    }))
  );
}

async function getThreadResponse(
  database: DbTransaction,
  threadUuid: string
): Promise<ChampionshipThreadResponse> {
  const creatorAccounts = alias(accounts, "thread_creator_accounts");
  const resolverAccounts = alias(accounts, "thread_resolver_accounts");
  const [row] = await database
    .select({
      thread: championshipThreads,
      creator: creatorAccounts,
      resolver: resolverAccounts
    })
    .from(championshipThreads)
    .innerJoin(
      creatorAccounts,
      eq(championshipThreads.createdByAccountId, creatorAccounts.id)
    )
    .leftJoin(
      resolverAccounts,
      eq(championshipThreads.resolvedByAccountId, resolverAccounts.id)
    )
    .where(eq(championshipThreads.uuid, threadUuid));

  if (!row) {
    throw notFound("Championship thread not found");
  }

  const [countRow] = await database
    .select({ count: count() })
    .from(championshipComments)
    .where(
      and(
        eq(championshipComments.threadId, row.thread.id),
        isNull(championshipComments.deletedAt)
      )
    );
  const [latest] = await database
    .select({ uuid: championshipComments.uuid })
    .from(championshipComments)
    .where(
      and(
        eq(championshipComments.threadId, row.thread.id),
        isNull(championshipComments.deletedAt)
      )
    )
    .orderBy(desc(championshipComments.id))
    .limit(1);

  return {
    uuid: row.thread.uuid,
    contextType: row.thread.contextType,
    contextUuid: row.thread.contextUuid,
    title: row.thread.title,
    state: row.thread.state,
    createdBy: {
      accountUuid: row.creator.uuid,
      name: row.creator.name
    },
    resolvedBy: row.resolver
      ? {
          accountUuid: row.resolver.uuid,
          name: row.resolver.name
        }
      : null,
    resolvedAt: row.thread.resolvedAt,
    revision: row.thread.revision,
    commentCount: countRow?.count ?? 0,
    latestComment: latest
      ? await getCommentResponse(database, latest.uuid)
      : null,
    createdAt: row.thread.createdAt,
    updatedAt: row.thread.updatedAt
  };
}

async function getCommentResponse(
  database: DbTransaction,
  commentUuid: string
): Promise<ChampionshipCommentResponse> {
  const [row] = await database
    .select({
      comment: championshipComments,
      threadUuid: championshipThreads.uuid,
      author: accounts
    })
    .from(championshipComments)
    .innerJoin(
      championshipThreads,
      eq(championshipComments.threadId, championshipThreads.id)
    )
    .innerJoin(accounts, eq(championshipComments.authorAccountId, accounts.id))
    .where(eq(championshipComments.uuid, commentUuid));

  if (!row) {
    throw notFound("Championship comment not found");
  }

  const mentions = await database
    .select({ uuid: accounts.uuid, name: accounts.name })
    .from(championshipCommentMentions)
    .innerJoin(accounts, eq(championshipCommentMentions.accountId, accounts.id))
    .where(eq(championshipCommentMentions.commentId, row.comment.id))
    .orderBy(asc(championshipCommentMentions.id));

  return {
    uuid: row.comment.uuid,
    threadUuid: row.threadUuid,
    author: {
      accountUuid: row.author.uuid,
      name: row.author.name
    },
    body: row.comment.body,
    mentions: mentions.map((mention) => ({
      accountUuid: mention.uuid,
      name: mention.name
    })),
    revision: row.comment.revision,
    editedAt: row.comment.editedAt,
    createdAt: row.comment.createdAt,
    updatedAt: row.comment.updatedAt
  };
}

async function getAssignmentResponse(
  database: DbTransaction,
  assignmentUuid: string
): Promise<ChampionshipAssignmentResponse> {
  const assigneeAccounts = alias(accounts, "assignment_assignee_accounts");
  const assignerAccounts = alias(accounts, "assignment_assigner_accounts");
  const [row] = await database
    .select({
      assignment: championshipAssignments,
      assignee: assigneeAccounts,
      assigner: assignerAccounts
    })
    .from(championshipAssignments)
    .innerJoin(
      assigneeAccounts,
      eq(championshipAssignments.assigneeAccountId, assigneeAccounts.id)
    )
    .innerJoin(
      assignerAccounts,
      eq(championshipAssignments.assignedByAccountId, assignerAccounts.id)
    )
    .where(eq(championshipAssignments.uuid, assignmentUuid));

  if (!row) {
    throw notFound("Championship assignment not found");
  }

  return {
    uuid: row.assignment.uuid,
    contextType: row.assignment.contextType,
    contextUuid: row.assignment.contextUuid,
    title: row.assignment.title,
    description: row.assignment.description,
    assignee: {
      accountUuid: row.assignee.uuid,
      name: row.assignee.name
    },
    assignedBy: {
      accountUuid: row.assigner.uuid,
      name: row.assigner.name
    },
    state: row.assignment.state,
    dueAt: row.assignment.dueAt,
    completedAt: row.assignment.completedAt,
    revision: row.assignment.revision,
    createdAt: row.assignment.createdAt,
    updatedAt: row.assignment.updatedAt
  };
}

async function listActivePresence(
  database: DbTransaction,
  championshipId: number,
  now: string
): Promise<ChampionshipPresenceResponse[]> {
  const rows = await database
    .select({
      presence: championshipPresence,
      account: accounts
    })
    .from(championshipPresence)
    .innerJoin(accounts, eq(championshipPresence.accountId, accounts.id))
    .where(
      and(
        eq(championshipPresence.championshipId, championshipId),
        gt(championshipPresence.expiresAt, now)
      )
    )
    .orderBy(asc(championshipPresence.id));

  return rows.map(({ presence, account }) => ({
    accountUuid: account.uuid,
    name: account.name,
    sessionUuid: presence.sessionUuid,
    contextType: presence.contextType,
    contextUuid: presence.contextUuid,
    expiresAt: presence.expiresAt
  }));
}
