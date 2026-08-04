import { and, asc, count, eq, gt, inArray, isNull, max } from "drizzle-orm";
import { db, withDatabaseTransaction } from "@/db/client";
import {
  championshipAuditEvents,
  championshipCommands,
  championshipCompetitionTypes,
  championshipOutboxEvents,
  championshipRoomPrograms,
  championshipRuleVersions,
  championships
} from "@/features/championships/core/db";
import {
  championshipRulesVersion,
  decodeChampionshipRules
} from "@/features/championships/core/rules";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  type CreateChampionshipInput,
  type ListChampionshipsQuery,
  type TransitionChampionshipInput,
  type UpdateChampionshipInput
} from "@/features/championships/_shared/http/inputs";
import {
  type ChampionshipDetailResponse,
  type ChampionshipSummaryResponse
} from "@/features/championships/_shared/http/responses";
import {
  getChampionshipDetailFrom,
  toChampionshipSummaryResponse
} from "@/features/championships/_shared/db/queries";
import { roomPrograms } from "@/features/rooms/core-db";
import { championshipTeamMemberships } from "@/features/championships/people/db";
import { assertChampionshipCompletionReady } from "@/features/championships/history/operations";
import { badRequest, conflict } from "@/shared/http/errors";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse
} from "@lib";

export async function createChampionship(
  input: CreateChampionshipInput
): Promise<ChampionshipDetailResponse> {
  if (input.createCompleted && !input.historical) {
    throw badRequest(
      "Only historical championships may be created as completed"
    );
  }

  assertDateOrder(input.startsAt ?? null, input.endsAt ?? null);

  return withDatabaseTransaction(async (tx) => {
    const actor = await requireChampionshipActor(tx, {
      actorAccountUuid: input.actorAccountUuid,
      permission: "championship:admin"
    });
    const [existingCommand] = await tx
      .select()
      .from(championshipCommands)
      .where(eq(championshipCommands.commandUuid, input.commandUuid));

    if (existingCommand) {
      if (
        existingCommand.actorAccountId !== actor.account.id ||
        existingCommand.action !== "championship.created"
      ) {
        throw conflict("Command UUID has already been used");
      }

      const [existingChampionship] = await tx
        .select({ uuid: championships.uuid })
        .from(championships)
        .where(eq(championships.id, existingCommand.championshipId));

      if (!existingChampionship) {
        throw conflict("Idempotent command target no longer exists");
      }

      return await getChampionshipDetailFrom(tx, existingChampionship.uuid);
    }

    const [competitionType] = await tx
      .select()
      .from(championshipCompetitionTypes)
      .where(eq(championshipCompetitionTypes.uuid, input.competitionTypeId));

    if (!competitionType || competitionType.state !== "active") {
      throw badRequest("Active competition type not found");
    }

    const [duplicateSlug] = await tx
      .select({ id: championships.id })
      .from(championships)
      .where(eq(championships.slug, input.slug));

    if (duplicateSlug) {
      throw badRequest("Championship slug already exists");
    }

    const rules = decodeChampionshipRules(
      competitionType.defaultRulesSchemaVersion,
      competitionType.defaultRules
    );
    const requestedProgramUuids = input.roomProgramIds ?? [];

    if (
      input.defaultRoomProgramId &&
      !requestedProgramUuids.includes(input.defaultRoomProgramId)
    ) {
      throw badRequest(
        "Default room program must be included in the championship program set"
      );
    }

    const programRows =
      requestedProgramUuids.length === 0
        ? []
        : await tx
            .select()
            .from(roomPrograms)
            .where(inArray(roomPrograms.uuid, requestedProgramUuids));

    if (programRows.length !== requestedProgramUuids.length) {
      throw badRequest("One or more room programs were not found");
    }

    const now = new Date().toISOString();
    const [championship] = await tx
      .insert(championships)
      .values({
        slug: input.slug,
        competitionTypeId: competitionType.id,
        name: input.name,
        editionLabel: input.editionLabel ?? null,
        description: input.description ?? null,
        lifecycle: input.createCompleted ? "completed" : "setup",
        registrationState: "not-open",
        priceState: rules.salary.enabled ? "editable" : "disabled",
        tradeWindowState: input.createCompleted ? "closed" : "open",
        rulesSchemaVersion: championshipRulesVersion,
        rules,
        historical: input.historical ?? false,
        revision: 1,
        changeSequence: 1,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        completedAt: input.createCompleted ? now : null
      })
      .returning();

    await tx.insert(championshipRuleVersions).values({
      championshipId: championship.id,
      version: 1,
      schemaVersion: championshipRulesVersion,
      rules,
      actorAccountId: actor.account.id,
      reason: "Initial rules copied from competition type"
    });

    if (programRows.length > 0) {
      await tx.insert(championshipRoomPrograms).values(
        programRows.map((program) => ({
          championshipId: championship.id,
          roomProgramId: program.id,
          isDefault: program.uuid === input.defaultRoomProgramId
        }))
      );
    }

    const detail = await getChampionshipDetailFrom(tx, championship.uuid);
    const [auditEvent] = await tx
      .insert(championshipAuditEvents)
      .values({
        championshipId: championship.id,
        sequence: 1,
        correlationUuid: input.commandUuid,
        commandUuid: input.commandUuid,
        actorKind: "account",
        actorAccountId: actor.account.id,
        action: "championship.created",
        source: "api",
        targetType: "championship",
        targetUuid: championship.uuid,
        before: null,
        after: detail
      })
      .returning();

    await tx.insert(championshipOutboxEvents).values({
      championshipId: championship.id,
      auditEventId: auditEvent.id,
      topic: "championship.created",
      payload: {
        championshipUuid: championship.uuid,
        sequence: 1,
        revision: 1
      }
    });
    await tx.insert(championshipCommands).values({
      commandUuid: input.commandUuid,
      championshipId: championship.id,
      actorAccountId: actor.account.id,
      expectedRevision: 0,
      resultingRevision: 1,
      action: "championship.created",
      response: detail
    });

    return detail;
  });
}

export async function updateChampionship(
  uuid: string,
  input: UpdateChampionshipInput
): Promise<ChampionshipDetailResponse> {
  assertDateOrder(input.startsAt, input.endsAt);

  return executeChampionshipCommand(
    {
      championshipUuid: uuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "championship.updated"
    },
    async (tx, championship, actor) => {
      if (
        input.name === undefined &&
        input.editionLabel === undefined &&
        input.description === undefined &&
        input.startsAt === undefined &&
        input.endsAt === undefined &&
        input.rules === undefined
      ) {
        throw badRequest("At least one championship field is required");
      }

      const rules =
        input.rules === undefined
          ? championship.rules
          : decodeChampionshipRules(championshipRulesVersion, input.rules);
      let priceState = championship.priceState;

      if (input.rules !== undefined) {
        const salaryChanged =
          JSON.stringify(rules.salary) !==
          JSON.stringify(championship.rules.salary);

        if (salaryChanged && championship.priceState === "locked") {
          throw conflict(
            "Salary rules cannot change after championship prices are frozen",
            { priceState: championship.priceState }
          );
        }

        if (rules.salary.enabled && !championship.rules.salary.enabled) {
          const [membershipCount] = await tx
            .select({ value: count() })
            .from(championshipTeamMemberships)
            .where(
              and(
                eq(championshipTeamMemberships.championshipId, championship.id),
                isNull(championshipTeamMemberships.endedAt)
              )
            );

          if ((membershipCount?.value ?? 0) > 0) {
            throw conflict(
              "Salary management cannot be enabled after roster activity"
            );
          }
        }

        priceState = rules.salary.enabled ? "editable" : "disabled";
      }
      const startsAt =
        input.startsAt === undefined ? championship.startsAt : input.startsAt;
      const endsAt =
        input.endsAt === undefined ? championship.endsAt : input.endsAt;
      assertDateOrder(startsAt, endsAt);
      const before = {
        ...championship,
        revision: championship.revision - 1,
        changeSequence: championship.changeSequence - 1
      };
      const [updated] = await tx
        .update(championships)
        .set({
          name: input.name ?? championship.name,
          editionLabel:
            input.editionLabel === undefined
              ? championship.editionLabel
              : input.editionLabel,
          description:
            input.description === undefined
              ? championship.description
              : input.description,
          startsAt,
          endsAt,
          rules,
          rulesSchemaVersion: championshipRulesVersion,
          priceState
        })
        .where(eq(championships.id, championship.id))
        .returning();

      if (input.rules !== undefined) {
        const [versionRow] = await tx
          .select({ version: max(championshipRuleVersions.version) })
          .from(championshipRuleVersions)
          .where(eq(championshipRuleVersions.championshipId, championship.id));

        await tx.insert(championshipRuleVersions).values({
          championshipId: championship.id,
          version: (versionRow?.version ?? 0) + 1,
          schemaVersion: championshipRulesVersion,
          rules,
          actorAccountId: actor.account.id,
          reason: input.reason ?? null
        });
      }

      const detail = await getChampionshipDetailFrom(
        tx,
        championship.uuid,
        true
      );

      return {
        response: () => detail,
        targetType: "championship",
        targetUuid: championship.uuid,
        before,
        after: updated,
        reason: input.reason ?? null
      };
    }
  );
}

export async function transitionChampionship(
  uuid: string,
  input: TransitionChampionshipInput
): Promise<ChampionshipDetailResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid: uuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: `championship.${input.transition}`
    },
    async (tx, championship) => {
      const now = new Date().toISOString();
      if (input.transition === "complete") {
        await assertChampionshipCompletionReady(
          tx,
          championship.id,
          championship.historical
        );
      }
      const next = resolveTransition(championship, input.transition, now);
      const before = {
        ...championship,
        revision: championship.revision - 1,
        changeSequence: championship.changeSequence - 1
      };
      const [updated] = await tx
        .update(championships)
        .set(next)
        .where(eq(championships.id, championship.id))
        .returning();
      const detail = await getChampionshipDetailFrom(
        tx,
        championship.uuid,
        true
      );

      return {
        response: () => detail,
        targetType: "championship",
        targetUuid: championship.uuid,
        before,
        after: updated,
        reason: input.reason ?? null
      };
    }
  );
}

export async function listChampionships(
  query: ListChampionshipsQuery = {}
): Promise<PaginatedResponse<ChampionshipSummaryResponse>> {
  const cursor = decodeCursor<number>(query.cursor);
  const conditions = [
    isNull(championships.deletedAt),
    cursor === undefined ? undefined : gt(championships.id, cursor),
    query.slug ? eq(championships.slug, query.slug) : undefined,
    !query.visibility || query.visibility === "public"
      ? eq(championships.visibility, "public")
      : query.visibility === "all"
        ? undefined
        : eq(championships.visibility, query.visibility),
    query.lifecycle ? eq(championships.lifecycle, query.lifecycle) : undefined,
    query.competitionTypeId
      ? eq(championshipCompetitionTypes.uuid, query.competitionTypeId)
      : undefined
  ].filter((condition) => condition !== undefined);
  const rows = await db
    .select({
      championship: championships,
      competitionType: championshipCompetitionTypes
    })
    .from(championships)
    .innerJoin(
      championshipCompetitionTypes,
      eq(championships.competitionTypeId, championshipCompetitionTypes.id)
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(championships.id))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, ({ championship }) => championship.id);

  return {
    items: page.items.map(toChampionshipSummaryResponse),
    page: page.page
  };
}

function resolveTransition(
  championship: typeof championships.$inferSelect,
  transition: TransitionChampionshipInput["transition"],
  now: string
): Partial<typeof championships.$inferInsert> {
  switch (transition) {
    case "publish":
      if (championship.visibility === "public") {
        throw badRequest("Championship is already public");
      }

      return { visibility: "public", publishedAt: now };
    case "unpublish":
      if (championship.visibility === "private") {
        throw badRequest("Championship is already private");
      }

      return { visibility: "private", publishedAt: null };
    case "activate":
      if (championship.lifecycle !== "setup") {
        throw badRequest("Only setup championships can be activated");
      }

      return { lifecycle: "active" };
    case "complete":
      if (
        championship.lifecycle !== "active" &&
        !(championship.historical && championship.lifecycle === "setup")
      ) {
        throw badRequest(
          "Only active or historical setup championships can be completed"
        );
      }

      return {
        lifecycle: "completed",
        completedAt: now,
        tradeWindowState: "closed"
      };
    case "archive":
      if (
        championship.lifecycle !== "completed" &&
        championship.lifecycle !== "canceled"
      ) {
        throw badRequest(
          "Only completed or canceled championships can be archived"
        );
      }

      return {
        lifecycle: "archived",
        archivedAt: now,
        tradeWindowState: "closed"
      };
    case "cancel":
      if (
        championship.lifecycle !== "setup" &&
        championship.lifecycle !== "active"
      ) {
        throw badRequest("Only setup or active championships can be canceled");
      }

      return {
        lifecycle: "canceled",
        canceledAt: now,
        tradeWindowState: "closed"
      };
    case "delete":
      return {
        visibility: "private",
        registrationState: "closed",
        deletedAt: now
      };
  }
}

function assertDateOrder(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined
): void {
  if (startsAt && endsAt && Date.parse(startsAt) > Date.parse(endsAt)) {
    throw badRequest("Championship end must not precede its start");
  }
}
