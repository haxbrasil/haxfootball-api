import { and, eq } from "drizzle-orm";
import { type DbTransaction, withDatabaseTransaction } from "@/db/client";
import {
  championshipAuditEvents,
  championshipCommands,
  championshipOutboxEvents,
  championships,
  type Championship
} from "@/features/championships/core/db";
import {
  findChampionshipActor,
  requireChampionshipActor,
  type ChampionshipActor,
  type ChampionshipPermission
} from "@/features/championships/core/authorization";
import { conflict, notFound } from "@/shared/http/errors";

type ChampionshipCommandOutcome<T> = {
  response: (revision: number) => T;
  targetType: string;
  targetUuid?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  outboxTopic?: string;
};

export type ChampionshipCommandInput = {
  championshipUuid: string;
  actorAccountUuid: string;
  commandUuid: string;
  expectedRevision: number;
  permission?: ChampionshipPermission | ChampionshipPermission[];
  authorize?: (
    database: DbTransaction,
    championship: Championship,
    actor: ChampionshipActor
  ) => Promise<void>;
  action: string;
  source?: string;
  correlationUuid?: string;
};

export async function executeChampionshipCommand<T>(
  input: ChampionshipCommandInput,
  mutate: (
    database: DbTransaction,
    championship: Championship,
    actor: ChampionshipActor
  ) => Promise<ChampionshipCommandOutcome<T>>
): Promise<T> {
  return withDatabaseTransaction(async (tx) => {
    const [championship] = await tx
      .select()
      .from(championships)
      .where(eq(championships.uuid, input.championshipUuid));

    if (!championship) {
      throw notFound("Championship not found");
    }

    let actor = await findChampionshipActor(tx, input.actorAccountUuid);
    const [existingCommand] = await tx
      .select()
      .from(championshipCommands)
      .where(eq(championshipCommands.commandUuid, input.commandUuid));

    if (existingCommand) {
      if (
        existingCommand.championshipId !== championship.id ||
        existingCommand.actorAccountId !== actor.account.id ||
        existingCommand.action !== input.action
      ) {
        throw conflict("Command UUID has already been used", {
          commandUuid: input.commandUuid
        });
      }

      return existingCommand.response as T;
    }

    if (!input.permission && !input.authorize) {
      throw new Error(
        "Championship commands require a permission or an authorization callback"
      );
    }

    if (input.permission) {
      actor = await requireChampionshipActor(tx, {
        actorAccountUuid: input.actorAccountUuid,
        permission: input.permission,
        championshipId: championship.id
      });
    }

    await input.authorize?.(tx, championship, actor);

    if (championship.revision !== input.expectedRevision) {
      throwRevisionConflict(championship, input.expectedRevision);
    }

    const nextRevision = championship.revision + 1;
    const nextSequence = championship.changeSequence + 1;
    const now = new Date().toISOString();
    const [updatedChampionship] = await tx
      .update(championships)
      .set({
        revision: nextRevision,
        changeSequence: nextSequence,
        updatedAt: now
      })
      .where(
        and(
          eq(championships.id, championship.id),
          eq(championships.revision, input.expectedRevision)
        )
      )
      .returning();

    if (!updatedChampionship) {
      const [current] = await tx
        .select()
        .from(championships)
        .where(eq(championships.id, championship.id));

      throwRevisionConflict(current ?? championship, input.expectedRevision);
    }

    const outcome = await mutate(tx, updatedChampionship, actor);
    const response = outcome.response(nextRevision);
    const [auditEvent] = await tx
      .insert(championshipAuditEvents)
      .values({
        championshipId: championship.id,
        sequence: nextSequence,
        correlationUuid: input.correlationUuid ?? input.commandUuid,
        commandUuid: input.commandUuid,
        actorKind: "account",
        actorAccountId: actor.account.id,
        action: input.action,
        source: input.source ?? "api",
        targetType: outcome.targetType,
        targetUuid: outcome.targetUuid ?? null,
        before: outcome.before,
        after: outcome.after,
        reason: outcome.reason ?? null,
        metadata: outcome.metadata ?? null
      })
      .returning();

    await tx.insert(championshipOutboxEvents).values({
      championshipId: championship.id,
      auditEventId: auditEvent.id,
      topic: outcome.outboxTopic ?? "championship.changed",
      payload: {
        championshipUuid: championship.uuid,
        sequence: nextSequence,
        revision: nextRevision,
        action: input.action,
        targetType: outcome.targetType,
        targetUuid: outcome.targetUuid ?? null
      }
    });
    await tx.insert(championshipCommands).values({
      commandUuid: input.commandUuid,
      championshipId: championship.id,
      actorAccountId: actor.account.id,
      expectedRevision: input.expectedRevision,
      resultingRevision: nextRevision,
      action: input.action,
      response
    });

    return response;
  });
}

function throwRevisionConflict(
  championship: Championship,
  expectedRevision: number
): never {
  throw conflict("Championship revision does not match", {
    championshipUuid: championship.uuid,
    expectedRevision,
    currentRevision: championship.revision,
    currentChangeSequence: championship.changeSequence
  });
}
