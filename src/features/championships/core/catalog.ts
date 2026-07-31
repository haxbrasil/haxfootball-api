import { and, asc, eq, gt } from "drizzle-orm";
import { db, withDatabaseTransaction } from "@/db/client";
import {
  championshipCatalogAuditEvents,
  championshipCompetitionTypes
} from "@/features/championships/core/db";
import {
  decodeChampionshipRules,
  championshipRulesVersion
} from "@/features/championships/core/rules";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import {
  type CreateCompetitionTypeInput,
  type ListCompetitionTypesQuery,
  type UpdateCompetitionTypeInput
} from "@/features/championships/_shared/http/inputs";
import { type ChampionshipCompetitionTypeResponse } from "@/features/championships/_shared/http/responses";
import { toCompetitionTypeResponse } from "@/features/championships/_shared/db/queries";
import { badRequest, conflict, notFound } from "@/shared/http/errors";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse
} from "@lib";

export async function createCompetitionType(
  input: CreateCompetitionTypeInput
): Promise<ChampionshipCompetitionTypeResponse> {
  const rules = decodeChampionshipRules(
    championshipRulesVersion,
    input.defaultRules
  );

  return withDatabaseTransaction(async (tx) => {
    const actor = await requireChampionshipActor(tx, {
      actorAccountUuid: input.actorAccountUuid,
      permission: "championship:admin"
    });
    const [existingAudit] = await tx
      .select()
      .from(championshipCatalogAuditEvents)
      .where(eq(championshipCatalogAuditEvents.commandUuid, input.commandUuid));

    if (existingAudit) {
      if (
        existingAudit.actorAccountId !== actor.account.id ||
        existingAudit.action !== "competition-type.created" ||
        !existingAudit.targetUuid
      ) {
        throw conflict("Command UUID has already been used");
      }

      return await getCompetitionTypeResponse(tx, existingAudit.targetUuid);
    }

    const [existingSlug] = await tx
      .select({ id: championshipCompetitionTypes.id })
      .from(championshipCompetitionTypes)
      .where(eq(championshipCompetitionTypes.slug, input.slug));

    if (existingSlug) {
      throw badRequest("Competition type slug already exists");
    }

    const [competitionType] = await tx
      .insert(championshipCompetitionTypes)
      .values({
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        cadence: input.cadence ?? null,
        defaultRulesSchemaVersion: championshipRulesVersion,
        defaultRules: rules,
        revision: 1
      })
      .returning();

    await tx.insert(championshipCatalogAuditEvents).values({
      competitionTypeId: competitionType.id,
      sequence: 1,
      commandUuid: input.commandUuid,
      actorAccountId: actor.account.id,
      action: "competition-type.created",
      targetUuid: competitionType.uuid,
      before: null,
      after: toCompetitionTypeResponse(competitionType)
    });

    return toCompetitionTypeResponse(competitionType);
  });
}

export async function updateCompetitionType(
  uuid: string,
  input: UpdateCompetitionTypeInput
): Promise<ChampionshipCompetitionTypeResponse> {
  return withDatabaseTransaction(async (tx) => {
    const actor = await requireChampionshipActor(tx, {
      actorAccountUuid: input.actorAccountUuid,
      permission: "championship:admin"
    });
    const [existingAudit] = await tx
      .select()
      .from(championshipCatalogAuditEvents)
      .where(eq(championshipCatalogAuditEvents.commandUuid, input.commandUuid));

    if (existingAudit) {
      if (
        existingAudit.actorAccountId !== actor.account.id ||
        existingAudit.action !== "competition-type.updated" ||
        existingAudit.targetUuid !== uuid
      ) {
        throw conflict("Command UUID has already been used");
      }

      return await getCompetitionTypeResponse(tx, uuid);
    }

    const [current] = await tx
      .select()
      .from(championshipCompetitionTypes)
      .where(eq(championshipCompetitionTypes.uuid, uuid));

    if (!current) {
      throw notFound("Competition type not found");
    }

    if (current.revision !== input.expectedRevision) {
      throw conflict("Competition type revision does not match", {
        expectedRevision: input.expectedRevision,
        currentRevision: current.revision
      });
    }

    if (
      input.slug === undefined &&
      input.name === undefined &&
      input.description === undefined &&
      input.cadence === undefined &&
      input.defaultRules === undefined &&
      input.state === undefined
    ) {
      throw badRequest("At least one competition type field is required");
    }

    if (input.slug !== undefined && input.slug !== current.slug) {
      const [duplicate] = await tx
        .select({ id: championshipCompetitionTypes.id })
        .from(championshipCompetitionTypes)
        .where(eq(championshipCompetitionTypes.slug, input.slug));

      if (duplicate) {
        throw badRequest("Competition type slug already exists");
      }
    }

    const defaultRules =
      input.defaultRules === undefined
        ? current.defaultRules
        : decodeChampionshipRules(championshipRulesVersion, input.defaultRules);
    const now = new Date().toISOString();
    const [updated] = await tx
      .update(championshipCompetitionTypes)
      .set({
        slug: input.slug ?? current.slug,
        name: input.name ?? current.name,
        description:
          input.description === undefined
            ? current.description
            : input.description,
        cadence: input.cadence === undefined ? current.cadence : input.cadence,
        defaultRules,
        defaultRulesSchemaVersion: championshipRulesVersion,
        state: input.state ?? current.state,
        revision: current.revision + 1,
        updatedAt: now
      })
      .where(
        and(
          eq(championshipCompetitionTypes.id, current.id),
          eq(championshipCompetitionTypes.revision, input.expectedRevision)
        )
      )
      .returning();

    if (!updated) {
      throw conflict("Competition type changed while the command was running");
    }

    await tx.insert(championshipCatalogAuditEvents).values({
      competitionTypeId: current.id,
      sequence: updated.revision,
      commandUuid: input.commandUuid,
      actorAccountId: actor.account.id,
      action: "competition-type.updated",
      targetUuid: current.uuid,
      before: toCompetitionTypeResponse(current),
      after: toCompetitionTypeResponse(updated)
    });

    return toCompetitionTypeResponse(updated);
  });
}

export async function listCompetitionTypes(
  query: ListCompetitionTypesQuery = {}
): Promise<PaginatedResponse<ChampionshipCompetitionTypeResponse>> {
  const cursor = decodeCursor<number>(query.cursor);
  const conditions = [
    cursor === undefined
      ? undefined
      : gt(championshipCompetitionTypes.id, cursor),
    !query.state || query.state === "all"
      ? undefined
      : eq(championshipCompetitionTypes.state, query.state)
  ].filter((condition) => condition !== undefined);
  const rows = await db
    .select()
    .from(championshipCompetitionTypes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(championshipCompetitionTypes.id))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, (row) => row.id);

  return {
    items: page.items.map(toCompetitionTypeResponse),
    page: page.page
  };
}

async function getCompetitionTypeResponse(
  database: Parameters<typeof requireChampionshipActor>[0],
  uuid: string
): Promise<ChampionshipCompetitionTypeResponse> {
  const [competitionType] = await database
    .select()
    .from(championshipCompetitionTypes)
    .where(eq(championshipCompetitionTypes.uuid, uuid));

  if (!competitionType) {
    throw notFound("Competition type not found");
  }

  return toCompetitionTypeResponse(competitionType);
}
