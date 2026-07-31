import { and, asc, eq, gt } from "drizzle-orm";
import { db, type DbTransaction, withDatabaseTransaction } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import {
  championshipAuditEvents,
  championships
} from "@/features/championships/core/db";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { type ListChampionshipAuditQuery } from "@/features/championships/_shared/http/inputs";
import { type ChampionshipAuditEventResponse } from "@/features/championships/_shared/http/responses";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse
} from "@lib";
import { notFound } from "@/shared/http/errors";

export async function listChampionshipAuditEvents(
  championshipUuid: string,
  query: ListChampionshipAuditQuery
): Promise<PaginatedResponse<ChampionshipAuditEventResponse>> {
  return withDatabaseTransaction(async (tx) => {
    const championship = await requireActivityAccess(
      tx,
      championshipUuid,
      query.actorAccountUuid
    );
    const cursor = decodeCursor<number>(query.cursor);
    const afterSequence = Math.max(query.afterSequence ?? 0, cursor ?? 0);
    const conditions = [
      eq(championshipAuditEvents.championshipId, championship.id),
      afterSequence > 0
        ? gt(championshipAuditEvents.sequence, afterSequence)
        : undefined,
      query.targetType
        ? eq(championshipAuditEvents.targetType, query.targetType)
        : undefined,
      query.targetUuid
        ? eq(championshipAuditEvents.targetUuid, query.targetUuid)
        : undefined,
      query.action
        ? eq(championshipAuditEvents.action, query.action)
        : undefined,
      query.correlationUuid
        ? eq(championshipAuditEvents.correlationUuid, query.correlationUuid)
        : undefined,
      query.filterActorAccountUuid
        ? eq(accounts.uuid, query.filterActorAccountUuid)
        : undefined
    ].filter((condition) => condition !== undefined);
    const rows = await tx
      .select({
        event: championshipAuditEvents,
        account: accounts
      })
      .from(championshipAuditEvents)
      .leftJoin(
        accounts,
        eq(championshipAuditEvents.actorAccountId, accounts.id)
      )
      .where(and(...conditions))
      .orderBy(
        asc(championshipAuditEvents.sequence),
        asc(championshipAuditEvents.id)
      )
      .limit(pageLimit(query));
    const page = pageItems(rows, query, ({ event }) => event.sequence);

    return {
      items: page.items.map(toAuditEventResponse),
      page: page.page
    };
  });
}

export async function createChampionshipEventStream(input: {
  championshipUuid: string;
  actorAccountUuid: string;
  afterSequence: number;
  signal: AbortSignal;
}): Promise<Response> {
  const championship = await withDatabaseTransaction((tx) =>
    requireActivityAccess(tx, input.championshipUuid, input.actorAccountUuid)
  );
  const encoder = new TextEncoder();
  let sequence = input.afterSequence;
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const pump = async () => {
        while (!input.signal.aborted && !canceled) {
          const rows = await readAuditEventsAfter(
            championship.id,
            sequence,
            100
          );

          if (rows.length === 0) {
            controller.enqueue(
              encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`)
            );
            await Bun.sleep(1_000);
            continue;
          }

          for (const row of rows) {
            sequence = row.event.sequence;
            controller.enqueue(
              encoder.encode(
                `id: ${row.event.sequence}\nevent: championship-change\ndata: ${JSON.stringify(
                  toAuditEventResponse(row)
                )}\n\n`
              )
            );
          }
        }

        controller.close();
      };

      void pump().catch((error) => controller.error(error));
    },
    cancel() {
      canceled = true;
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}

async function requireActivityAccess(
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

async function readAuditEventsAfter(
  championshipId: number,
  sequence: number,
  limit: number
) {
  return db
    .select({
      event: championshipAuditEvents,
      account: accounts
    })
    .from(championshipAuditEvents)
    .leftJoin(accounts, eq(championshipAuditEvents.actorAccountId, accounts.id))
    .where(
      and(
        eq(championshipAuditEvents.championshipId, championshipId),
        gt(championshipAuditEvents.sequence, sequence)
      )
    )
    .orderBy(asc(championshipAuditEvents.sequence))
    .limit(limit);
}

function toAuditEventResponse(
  row: Awaited<ReturnType<typeof readAuditEventsAfter>>[number]
): ChampionshipAuditEventResponse {
  return {
    uuid: row.event.uuid,
    sequence: row.event.sequence,
    correlationUuid: row.event.correlationUuid,
    commandUuid: row.event.commandUuid,
    actor: {
      kind: row.event.actorKind,
      accountUuid: row.account?.uuid ?? null,
      accountName: row.account?.name ?? null
    },
    action: row.event.action,
    source: row.event.source,
    targetType: row.event.targetType,
    targetUuid: row.event.targetUuid,
    before: row.event.before ?? null,
    after: row.event.after ?? null,
    reason: row.event.reason,
    metadata: row.event.metadata ?? null,
    createdAt: row.event.createdAt
  };
}
