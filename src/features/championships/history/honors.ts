import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  or,
  sql
} from "drizzle-orm";
import {
  db,
  type DatabaseExecutor,
  withDatabaseTransaction
} from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  requireChampionshipActor,
  championshipActorHasPermission,
  findChampionshipActor
} from "@/features/championships/core/authorization";
import {
  championshipCompetitionTypes,
  championships
} from "@/features/championships/core/db";
import {
  championshipMatches,
  championshipSpots
} from "@/features/championships/format-scheduling/db";
import {
  championshipMatchResultRevisions,
  championshipMetricMappings,
  championshipStatisticEntries
} from "@/features/championships/matches-statistics/db";
import {
  championshipHistoricalPlayerIdentities,
  championshipParticipants,
  championshipTeamIdentities,
  championshipTeams
} from "@/features/championships/people/db";
import {
  championshipHonorDefinitionAuditEvents,
  championshipHonorDefinitionDrafts,
  championshipHonorDefinitions,
  championshipHonorDefinitionVersions,
  championshipHonorGrants,
  championshipHonors,
  championshipPlacements
} from "@/features/championships/history/db";
import type {
  ArchiveChampionshipHonorDefinitionInput,
  ChampionshipHonorDefinitionResponse,
  ChampionshipHonorResponse,
  ChampionshipHonorResolutionPreviewResponse,
  ChampionshipHonorsQuery,
  CreateChampionshipHonorDefinitionInput,
  CreateChampionshipHonorGrantInput,
  CreateChampionshipHonorInput,
  ListChampionshipHonorDefinitionsQuery,
  PublishChampionshipHonorDefinitionInput,
  ReorderChampionshipHonorsInput,
  RevokeChampionshipHonorGrantInput,
  ResolveChampionshipHonorInput,
  UpdateChampionshipHonorDefinitionDraftInput,
  UpdateChampionshipHonorInput
} from "@/features/championships/history/contracts";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse
} from "@lib";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "@/shared/http/errors";

type HonorTarget = {
  type:
    | "team"
    | "team-identity"
    | "participant"
    | "account"
    | "historical-player";
  uuid: string;
};

export async function listChampionshipHonorDefinitions(
  query: ListChampionshipHonorDefinitionsQuery = {}
): Promise<PaginatedResponse<ChampionshipHonorDefinitionResponse>> {
  const cursor = decodeCursor<{ id: number }>(query.cursor);
  const rows = await db
    .select()
    .from(championshipHonorDefinitions)
    .where(
      and(
        cursor ? gt(championshipHonorDefinitions.id, cursor.id) : undefined,
        query.competitionTypeId
          ? eq(championshipCompetitionTypes.uuid, query.competitionTypeId)
          : undefined,
        query.kind
          ? eq(championshipHonorDefinitions.kind, query.kind)
          : undefined,
        query.state && query.state !== "all"
          ? eq(championshipHonorDefinitions.state, query.state)
          : undefined
      )
    )
    .innerJoin(
      championshipCompetitionTypes,
      eq(
        championshipHonorDefinitions.competitionTypeId,
        championshipCompetitionTypes.id
      )
    )
    .orderBy(asc(championshipHonorDefinitions.id))
    .limit(pageLimit(query));
  const definitions = rows.map((row) => row.championship_honor_definitions);
  const page = pageItems(definitions, query, (row) => ({ id: row.id }));
  return {
    items: await Promise.all(
      page.items.map((row) => projectDefinition(db, row))
    ),
    page: page.page
  };
}

export async function createChampionshipHonorDefinition(
  input: CreateChampionshipHonorDefinitionInput
): Promise<ChampionshipHonorDefinitionResponse> {
  validateDefinitionFields(input);
  return withDatabaseTransaction(async (tx) => {
    const actor = await requireChampionshipActor(tx, {
      actorAccountUuid: input.actorAccountUuid,
      permission: "honor-definition:admin"
    });
    const [competitionType] = await tx
      .select()
      .from(championshipCompetitionTypes)
      .where(eq(championshipCompetitionTypes.uuid, input.competitionTypeId));
    if (!competitionType) throw notFound("Competition type not found");
    const existing = await tx
      .select({ id: championshipHonorDefinitions.id })
      .from(championshipHonorDefinitions)
      .where(
        and(
          eq(
            championshipHonorDefinitions.competitionTypeId,
            competitionType.id
          ),
          eq(championshipHonorDefinitions.slug, input.slug)
        )
      );
    if (existing.length)
      throw conflict("Honor definition slug is already in use");
    const [definition] = await tx
      .insert(championshipHonorDefinitions)
      .values({
        slug: input.slug,
        competitionTypeId: competitionType.id,
        kind: input.kind,
        createdByAccountId: actor.account.id
      })
      .returning();
    const [draft] = await tx
      .insert(championshipHonorDefinitionDrafts)
      .values({
        definitionId: definition.id,
        ...definitionFields(input)
      })
      .returning();
    await auditDefinition(
      tx,
      definition.id,
      actor.account.id,
      "honor-definition.created",
      null,
      {
        definition,
        draft
      }
    );
    return projectDefinition(tx, definition);
  });
}

export async function updateChampionshipHonorDefinitionDraft(
  definitionUuid: string,
  input: UpdateChampionshipHonorDefinitionDraftInput
): Promise<ChampionshipHonorDefinitionResponse> {
  validateDefinitionFields(input);
  return withDatabaseTransaction(async (tx) => {
    const actor = await requireChampionshipActor(tx, {
      actorAccountUuid: input.actorAccountUuid,
      permission: "honor-definition:admin"
    });
    const definition = await requireDefinition(tx, definitionUuid);
    const [draft] = await tx
      .select()
      .from(championshipHonorDefinitionDrafts)
      .where(eq(championshipHonorDefinitionDrafts.definitionId, definition.id));
    if (!draft) throw notFound("Honor definition draft not found");
    if (draft.revision !== input.expectedRevision) {
      throw conflict("Honor definition draft revision does not match", {
        currentRevision: draft.revision
      });
    }
    const [updated] = await tx
      .update(championshipHonorDefinitionDrafts)
      .set({
        ...definitionFields(input),
        revision: draft.revision + 1,
        updatedAt: new Date().toISOString()
      })
      .where(eq(championshipHonorDefinitionDrafts.id, draft.id))
      .returning();
    const [updatedDefinition] = await tx
      .update(championshipHonorDefinitions)
      .set({
        revision: definition.revision + 1,
        updatedAt: new Date().toISOString()
      })
      .where(eq(championshipHonorDefinitions.id, definition.id))
      .returning();
    await auditDefinition(
      tx,
      definition.id,
      actor.account.id,
      "honor-definition.draft-updated",
      draft,
      updated
    );
    return projectDefinition(tx, updatedDefinition);
  });
}

export async function publishChampionshipHonorDefinition(
  definitionUuid: string,
  input: PublishChampionshipHonorDefinitionInput
): Promise<ChampionshipHonorDefinitionResponse & { published: boolean }> {
  return withDatabaseTransaction(async (tx) => {
    const actor = await requireChampionshipActor(tx, {
      actorAccountUuid: input.actorAccountUuid,
      permission: "honor-definition:admin"
    });
    const definition = await requireDefinition(tx, definitionUuid);
    const [draft] = await tx
      .select()
      .from(championshipHonorDefinitionDrafts)
      .where(eq(championshipHonorDefinitionDrafts.definitionId, definition.id));
    if (!draft) throw notFound("Honor definition draft not found");
    if (draft.revision !== input.expectedRevision) {
      throw conflict("Honor definition draft revision does not match", {
        currentRevision: draft.revision
      });
    }
    const versions = await tx
      .select()
      .from(championshipHonorDefinitionVersions)
      .where(
        eq(championshipHonorDefinitionVersions.definitionId, definition.id)
      )
      .orderBy(desc(championshipHonorDefinitionVersions.version));
    const latest = versions[0];
    if (latest && samePublishedDefinition(latest, draft)) {
      return { ...(await projectDefinition(tx, definition)), published: false };
    }
    const [version] = await tx
      .insert(championshipHonorDefinitionVersions)
      .values({
        definitionId: definition.id,
        version: (latest?.version ?? 0) + 1,
        ...definitionFields(draft),
        publishedByAccountId: actor.account.id
      })
      .returning();
    await auditDefinition(
      tx,
      definition.id,
      actor.account.id,
      "honor-definition.published",
      latest ?? null,
      version
    );
    return { ...(await projectDefinition(tx, definition)), published: true };
  });
}

export async function archiveChampionshipHonorDefinition(
  definitionUuid: string,
  input: ArchiveChampionshipHonorDefinitionInput
): Promise<ChampionshipHonorDefinitionResponse> {
  return withDatabaseTransaction(async (tx) => {
    const actor = await requireChampionshipActor(tx, {
      actorAccountUuid: input.actorAccountUuid,
      permission: "honor-definition:admin"
    });
    const definition = await requireDefinition(tx, definitionUuid);
    if (definition.revision !== input.expectedRevision) {
      throw conflict("Honor definition revision does not match", {
        currentRevision: definition.revision
      });
    }
    const [updated] = await tx
      .update(championshipHonorDefinitions)
      .set({
        state: input.archived ? "archived" : "active",
        revision: definition.revision + 1,
        updatedAt: new Date().toISOString()
      })
      .where(eq(championshipHonorDefinitions.id, definition.id))
      .returning();
    await auditDefinition(
      tx,
      definition.id,
      actor.account.id,
      input.archived
        ? "honor-definition.archived"
        : "honor-definition.restored",
      definition,
      updated
    );
    return projectDefinition(tx, updated);
  });
}

export async function listChampionshipHonors(
  championshipUuid: string,
  query: ChampionshipHonorsQuery = {}
): Promise<PaginatedResponse<ChampionshipHonorResponse>> {
  const [championship] = await db
    .select()
    .from(championships)
    .where(
      and(
        eq(championships.uuid, championshipUuid),
        isNull(championships.deletedAt)
      )
    );
  if (!championship) throw notFound("Championship not found");
  let maySeeDrafts = false;
  if (query.actorAccountUuid) {
    const actor = await findChampionshipActor(db, query.actorAccountUuid);
    maySeeDrafts = await championshipActorHasPermission(db, actor, {
      permission: ["championship:admin", "championship:operate"],
      championshipId: championship.id
    });
  }
  if (championship.visibility !== "public" && !maySeeDrafts) {
    throw forbidden("Private championship honors require staff access");
  }
  const includeDrafts = query.includeDrafts === true && maySeeDrafts;
  const cursor = decodeCursor<{ id: number }>(query.cursor);
  const rows = await db
    .select()
    .from(championshipHonors)
    .where(
      and(
        eq(championshipHonors.championshipId, championship.id),
        cursor ? gt(championshipHonors.id, cursor.id) : undefined,
        includeDrafts ? undefined : ne(championshipHonors.state, "draft"),
        includeDrafts ? undefined : ne(championshipHonors.state, "void")
      )
    )
    .orderBy(asc(championshipHonors.displayOrder), asc(championshipHonors.id))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, (row) => ({ id: row.id }));
  return {
    items: await Promise.all(page.items.map((row) => projectHonor(db, row))),
    page: page.page
  };
}

export async function createChampionshipHonor(
  championshipUuid: string,
  input: CreateChampionshipHonorInput
): Promise<ChampionshipHonorResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "history.honor.created"
    },
    async (tx, championship) => {
      const [version] = await tx
        .select({
          version: championshipHonorDefinitionVersions,
          definition: championshipHonorDefinitions
        })
        .from(championshipHonorDefinitionVersions)
        .innerJoin(
          championshipHonorDefinitions,
          eq(
            championshipHonorDefinitionVersions.definitionId,
            championshipHonorDefinitions.id
          )
        )
        .where(
          eq(
            championshipHonorDefinitionVersions.uuid,
            input.definitionVersionUuid
          )
        );
      if (!version)
        throw notFound("Published honor definition version not found");
      if (
        version.definition.competitionTypeId !== championship.competitionTypeId
      ) {
        throw badRequest(
          "Honor definition belongs to another competition type"
        );
      }
      validateDecisionPolicy(
        input.decisionPolicy,
        version.version.recipientTypes
      );
      const now = new Date().toISOString();
      const [honor] = await tx
        .insert(championshipHonors)
        .values({
          championshipId: championship.id,
          definitionVersionId: version.version.id,
          state: input.state ?? "draft",
          nameOverride: input.nameOverride ?? null,
          descriptionOverride: input.descriptionOverride ?? null,
          decisionPolicy: input.decisionPolicy,
          displayOrder: input.displayOrder ?? 0,
          announcedAt: input.state === "announced" ? now : null
        })
        .returning();
      const response = await projectHonor(tx, honor);
      return {
        response: () => response,
        targetType: "championship-honor",
        targetUuid: honor.uuid,
        before: null,
        after: response
      };
    }
  );
}

export async function updateChampionshipHonor(
  championshipUuid: string,
  honorUuid: string,
  input: UpdateChampionshipHonorInput
): Promise<ChampionshipHonorResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "history.honor.updated"
    },
    async (tx, championship) => {
      const honor = await requireHonor(tx, championship.id, honorUuid);
      if (honor.state === "awarded" && input.state) {
        throw badRequest(
          "An awarded honor can only change after its grants are revoked"
        );
      }
      const [version] = await tx
        .select()
        .from(championshipHonorDefinitionVersions)
        .where(
          eq(championshipHonorDefinitionVersions.id, honor.definitionVersionId)
        );
      if (input.decisionPolicy)
        validateDecisionPolicy(input.decisionPolicy, version!.recipientTypes);
      const now = new Date().toISOString();
      const nextState = input.state ?? honor.state;
      const [updated] = await tx
        .update(championshipHonors)
        .set({
          state: nextState,
          nameOverride:
            input.nameOverride === undefined
              ? honor.nameOverride
              : input.nameOverride,
          descriptionOverride:
            input.descriptionOverride === undefined
              ? honor.descriptionOverride
              : input.descriptionOverride,
          decisionPolicy: input.decisionPolicy ?? honor.decisionPolicy,
          displayOrder: input.displayOrder ?? honor.displayOrder,
          revision: honor.revision + 1,
          announcedAt:
            nextState === "announced" && !honor.announcedAt
              ? now
              : honor.announcedAt,
          voidedAt: nextState === "void" ? now : null,
          updatedAt: now
        })
        .where(eq(championshipHonors.id, honor.id))
        .returning();
      const response = await projectHonor(tx, updated);
      return {
        response: () => response,
        targetType: "championship-honor",
        targetUuid: honor.uuid,
        before: await projectHonor(tx, honor),
        after: response,
        reason: input.reason
      };
    }
  );
}

export async function reorderChampionshipHonors(
  championshipUuid: string,
  input: ReorderChampionshipHonorsInput
): Promise<ChampionshipHonorResponse[]> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "history.honors.reordered"
    },
    async (tx, championship) => {
      const current = await tx
        .select()
        .from(championshipHonors)
        .where(
          and(
            eq(championshipHonors.championshipId, championship.id),
            ne(championshipHonors.state, "void")
          )
        )
        .orderBy(
          asc(championshipHonors.displayOrder),
          asc(championshipHonors.id)
        );
      const currentUuids = new Set(current.map((honor) => honor.uuid));
      if (
        input.honorUuids.length !== current.length ||
        input.honorUuids.some((uuid) => !currentUuids.has(uuid))
      ) {
        throw badRequest(
          "Honor order must contain every active championship honor exactly once"
        );
      }
      const before = await Promise.all(
        current.map((honor) => projectHonor(tx, honor))
      );
      const now = new Date().toISOString();
      for (const [displayOrder, honorUuid] of input.honorUuids.entries()) {
        const honor = current.find(
          (candidate) => candidate.uuid === honorUuid
        )!;
        if (honor.displayOrder === displayOrder) continue;
        await tx
          .update(championshipHonors)
          .set({
            displayOrder,
            revision: honor.revision + 1,
            updatedAt: now
          })
          .where(eq(championshipHonors.id, honor.id));
      }
      const reordered = await tx
        .select()
        .from(championshipHonors)
        .where(
          and(
            eq(championshipHonors.championshipId, championship.id),
            ne(championshipHonors.state, "void")
          )
        )
        .orderBy(
          asc(championshipHonors.displayOrder),
          asc(championshipHonors.id)
        );
      const after = await Promise.all(
        reordered.map((honor) => projectHonor(tx, honor))
      );
      return {
        response: () => after,
        targetType: "championship-honor-order",
        targetUuid: championship.uuid,
        before,
        after
      };
    }
  );
}

export async function previewChampionshipHonorResolution(
  championshipUuid: string,
  honorUuid: string,
  actorAccountUuid?: string
): Promise<ChampionshipHonorResolutionPreviewResponse> {
  const [championship] = await db
    .select()
    .from(championships)
    .where(
      and(
        eq(championships.uuid, championshipUuid),
        isNull(championships.deletedAt)
      )
    );
  if (!championship) throw notFound("Championship not found");
  if (championship.visibility !== "public" || actorAccountUuid) {
    if (!actorAccountUuid)
      throw forbidden("Private honor previews require staff access");
    await requireChampionshipActor(db, {
      actorAccountUuid,
      championshipId: championship.id,
      permission: ["championship:admin", "championship:operate"]
    });
  }
  const honor = await requireHonor(db, championship.id, honorUuid);
  return deriveHonorResolution(db, championship.id, honor);
}

export async function resolveChampionshipHonor(
  championshipUuid: string,
  honorUuid: string,
  input: ResolveChampionshipHonorInput
): Promise<ChampionshipHonorResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin"],
      action: "history.honor.resolved"
    },
    async (tx, championship, actor) => {
      const honor = await requireHonor(tx, championship.id, honorUuid);
      if (honor.state === "void")
        throw badRequest("A void honor cannot be resolved");
      const preview = await deriveHonorResolution(tx, championship.id, honor);
      if (!preview.ready) throw badRequest(preview.blockers.join("; "));
      const now = new Date().toISOString();
      await tx
        .update(championshipHonorGrants)
        .set({
          revokedAt: now,
          revokedByAccountId: actor.account.id,
          revocationReason: input.reason
        })
        .where(
          and(
            eq(championshipHonorGrants.honorId, honor.id),
            isNull(championshipHonorGrants.revokedAt)
          )
        );
      for (const contender of preview.contenders) {
        const target = await resolveHonorTarget(
          tx,
          championship.id,
          contender.target
        );
        await tx.insert(championshipHonorGrants).values({
          honorId: honor.id,
          targetType: contender.target.type,
          ...target.columns,
          teamIdentityIdSnapshot: target.identitySnapshotId,
          displayLabelSnapshot: contender.displayLabel,
          rank: contender.rank,
          note: preview.explanation,
          awardedByAccountId: actor.account.id
        });
      }
      const [updated] = await tx
        .update(championshipHonors)
        .set({
          state: "awarded",
          awardedAt: now,
          revision: honor.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipHonors.id, honor.id))
        .returning();
      const response = await projectHonor(tx, updated);
      return {
        response: () => response,
        targetType: "championship-honor",
        targetUuid: honor.uuid,
        before: await projectHonor(tx, honor),
        after: { honor: response, resolution: preview },
        reason: input.reason
      };
    }
  );
}

export async function reconcileCalculatedChampionshipHonors(
  database: DatabaseExecutor,
  championshipId: number,
  actorAccountId: number,
  policyTypes: Array<"placement" | "spot-result" | "metric-ranking">,
  reason: string
) {
  const honors = await database
    .select()
    .from(championshipHonors)
    .where(
      and(
        eq(championshipHonors.championshipId, championshipId),
        eq(championshipHonors.state, "awarded")
      )
    );
  const affected = honors.filter((honor) =>
    policyTypes.includes(
      honor.decisionPolicy.type as (typeof policyTypes)[number]
    )
  );
  const now = new Date().toISOString();
  for (const honor of affected) {
    const preview = await deriveHonorResolution(
      database,
      championshipId,
      honor
    );
    await database
      .update(championshipHonorGrants)
      .set({
        revokedAt: now,
        revokedByAccountId: actorAccountId,
        revocationReason: reason
      })
      .where(
        and(
          eq(championshipHonorGrants.honorId, honor.id),
          isNull(championshipHonorGrants.revokedAt)
        )
      );
    if (preview.ready) {
      for (const contender of preview.contenders) {
        const target = await resolveHonorTarget(
          database,
          championshipId,
          contender.target
        );
        await database.insert(championshipHonorGrants).values({
          honorId: honor.id,
          targetType: contender.target.type,
          ...target.columns,
          teamIdentityIdSnapshot: target.identitySnapshotId,
          displayLabelSnapshot: contender.displayLabel,
          rank: contender.rank,
          note: preview.explanation,
          awardedByAccountId: actorAccountId
        });
      }
    }
    await database
      .update(championshipHonors)
      .set({
        state: preview.ready ? "awarded" : "deciding",
        awardedAt: preview.ready ? now : null,
        revision: honor.revision + 1,
        updatedAt: now
      })
      .where(eq(championshipHonors.id, honor.id));
  }
  return affected.map((honor) => honor.uuid);
}

export async function createChampionshipHonorGrant(
  championshipUuid: string,
  honorUuid: string,
  input: CreateChampionshipHonorGrantInput
): Promise<ChampionshipHonorResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship-history:admin"],
      action: "history.honor.grant-created"
    },
    async (tx, championship, actor) => {
      const honor = await requireHonor(tx, championship.id, honorUuid);
      if (honor.state === "void")
        throw badRequest("A void honor cannot be awarded");
      const [version] = await tx
        .select()
        .from(championshipHonorDefinitionVersions)
        .where(
          eq(championshipHonorDefinitionVersions.id, honor.definitionVersionId)
        );
      if (!version!.recipientTypes.includes(input.target.type)) {
        throw badRequest("Target type is not allowed by this honor definition");
      }
      const target = await resolveHonorTarget(
        tx,
        championship.id,
        input.target
      );
      const active = await tx
        .select()
        .from(championshipHonorGrants)
        .where(
          and(
            eq(championshipHonorGrants.honorId, honor.id),
            isNull(championshipHonorGrants.revokedAt)
          )
        );
      if (active.length >= version!.maximumRecipients) {
        throw badRequest(
          "This honor already has the maximum number of recipients"
        );
      }
      if (
        active.some(
          (grant) =>
            grant.targetType === input.target.type &&
            targetMatches(grant, input.target.type, target)
        )
      ) {
        throw conflict("This recipient already holds the honor");
      }
      await tx.insert(championshipHonorGrants).values({
        honorId: honor.id,
        targetType: input.target.type,
        ...target.columns,
        teamIdentityIdSnapshot: target.identitySnapshotId,
        displayLabelSnapshot: target.label,
        rank: input.rank ?? null,
        note: input.note ?? null,
        awardedByAccountId: actor.account.id
      });
      const activeCount = active.length + 1;
      const nextState =
        activeCount >= version!.minimumRecipients ? "awarded" : "deciding";
      const [updated] = await tx
        .update(championshipHonors)
        .set({
          state: nextState,
          awardedAt: nextState === "awarded" ? new Date().toISOString() : null,
          revision: honor.revision + 1,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championshipHonors.id, honor.id))
        .returning();
      const response = await projectHonor(tx, updated);
      return {
        response: () => response,
        targetType: "championship-honor-grant",
        targetUuid: response.grants.at(-1)?.uuid,
        before: await projectHonor(tx, honor),
        after: response,
        reason: input.reason
      };
    }
  );
}

export async function revokeChampionshipHonorGrant(
  championshipUuid: string,
  honorUuid: string,
  grantUuid: string,
  input: RevokeChampionshipHonorGrantInput
): Promise<ChampionshipHonorResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship-history:admin"],
      action: "history.honor.grant-revoked"
    },
    async (tx, championship, actor) => {
      const honor = await requireHonor(tx, championship.id, honorUuid);
      const [grant] = await tx
        .select()
        .from(championshipHonorGrants)
        .where(
          and(
            eq(championshipHonorGrants.uuid, grantUuid),
            eq(championshipHonorGrants.honorId, honor.id)
          )
        );
      if (!grant) throw notFound("Honor grant not found");
      if (grant.revokedAt) throw conflict("Honor grant is already revoked");
      const now = new Date().toISOString();
      await tx
        .update(championshipHonorGrants)
        .set({
          revokedAt: now,
          revokedByAccountId: actor.account.id,
          revocationReason: input.reason
        })
        .where(eq(championshipHonorGrants.id, grant.id));
      const remaining = await tx
        .select()
        .from(championshipHonorGrants)
        .where(
          and(
            eq(championshipHonorGrants.honorId, honor.id),
            isNull(championshipHonorGrants.revokedAt)
          )
        );
      const [version] = await tx
        .select()
        .from(championshipHonorDefinitionVersions)
        .where(
          eq(championshipHonorDefinitionVersions.id, honor.definitionVersionId)
        );
      const nextState =
        remaining.length >= version!.minimumRecipients ? "awarded" : "deciding";
      const [updated] = await tx
        .update(championshipHonors)
        .set({
          state: nextState,
          awardedAt: nextState === "awarded" ? honor.awardedAt : null,
          revision: honor.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipHonors.id, honor.id))
        .returning();
      const response = await projectHonor(tx, updated);
      return {
        response: () => response,
        targetType: "championship-honor-grant",
        targetUuid: grant.uuid,
        before: await projectHonor(tx, honor),
        after: response,
        reason: input.reason
      };
    }
  );
}

function definitionFields(input: {
  name: string;
  description?: string | null;
  recipientTypes: Array<HonorTarget["type"]>;
  minimumRecipients: number;
  maximumRecipients: number;
  aggregateByIdentity: boolean;
  presentation?: Record<string, unknown>;
}) {
  return {
    name: input.name,
    description: input.description ?? null,
    recipientTypes: input.recipientTypes,
    minimumRecipients: input.minimumRecipients,
    maximumRecipients: input.maximumRecipients,
    aggregateByIdentity: input.aggregateByIdentity,
    presentation: input.presentation ?? {}
  };
}

function validateDefinitionFields(input: {
  recipientTypes: Array<HonorTarget["type"]>;
  minimumRecipients: number;
  maximumRecipients: number;
  aggregateByIdentity: boolean;
}) {
  if (input.minimumRecipients > input.maximumRecipients) {
    throw badRequest("Minimum recipients cannot exceed maximum recipients");
  }
  if (
    input.aggregateByIdentity &&
    !input.recipientTypes.some(
      (type) => type === "team" || type === "team-identity"
    )
  ) {
    throw badRequest("Identity aggregation requires a team recipient type");
  }
}

function validateDecisionPolicy(
  policy: CreateChampionshipHonorInput["decisionPolicy"],
  recipientTypes: Array<HonorTarget["type"]>
) {
  if (
    policy.type === "placement" &&
    !recipientTypes.includes("team") &&
    !recipientTypes.includes("team-identity")
  ) {
    throw badRequest("Placement policies require a team recipient type");
  }
  if (
    policy.type === "metric-ranking" &&
    policy.metricKey.trim().length === 0
  ) {
    throw badRequest("Metric ranking requires a metric key");
  }
}

type ResolutionContender =
  ChampionshipHonorResolutionPreviewResponse["contenders"][number];

async function deriveHonorResolution(
  database: DatabaseExecutor,
  championshipId: number,
  honor: typeof championshipHonors.$inferSelect
): Promise<ChampionshipHonorResolutionPreviewResponse> {
  const [version] = await database
    .select()
    .from(championshipHonorDefinitionVersions)
    .where(
      eq(championshipHonorDefinitionVersions.id, honor.definitionVersionId)
    );
  if (!version) throw notFound("Honor definition version not found");
  const policy = honor.decisionPolicy;
  let contenders: ResolutionContender[] = [];
  const blockers: string[] = [];
  let explanation = "";

  if (policy.type === "staff-selection") {
    blockers.push(
      "Esta conquista exige a escolha de um vencedor pela organização"
    );
    explanation = "Vencedor escolhido pela organização.";
  } else if (policy.type === "hybrid") {
    blockers.push("Esta conquista exige uma decisão da organização");
    explanation = policy.note;
  } else if (policy.type === "placement") {
    const rows = await database
      .select({ placement: championshipPlacements, team: championshipTeams })
      .from(championshipPlacements)
      .innerJoin(
        championshipTeams,
        eq(championshipPlacements.teamId, championshipTeams.id)
      )
      .where(
        and(
          eq(championshipPlacements.championshipId, championshipId),
          inArray(championshipPlacements.rank, policy.ranks)
        )
      )
      .orderBy(asc(championshipPlacements.rank));
    for (const { placement, team } of rows) {
      const target = await honorTeamTarget(
        database,
        team,
        version.recipientTypes
      );
      if (target)
        contenders.push({
          target,
          displayLabel: team.name,
          rank: placement.rank,
          value: null,
          tied: false
        });
    }
    const missing = policy.ranks.filter(
      (rank) => !rows.some((row) => row.placement.rank === rank)
    );
    if (missing.length)
      blockers.push(
        `Colocação oficial ainda não definida: ${missing.join(", ")}`
      );
    explanation = `Resultado baseado na colocação oficial ${policy.ranks.join(", ")}.`;
  } else if (policy.type === "spot-result") {
    const spots = await database
      .select()
      .from(championshipSpots)
      .where(
        and(
          eq(championshipSpots.championshipId, championshipId),
          inArray(championshipSpots.uuid, policy.spotUuids)
        )
      );
    for (const spotUuid of policy.spotUuids) {
      const spot = spots.find((item) => item.uuid === spotUuid);
      if (!spot) {
        blockers.push(`O spot configurado ${spotUuid} não existe mais`);
        continue;
      }
      let teamId = spot.currentTeamId;
      if (policy.outcome !== "occupant") {
        const [match] = await database
          .select()
          .from(championshipMatches)
          .where(
            and(
              eq(championshipMatches.championshipId, championshipId),
              or(
                eq(championshipMatches.sideASpotId, spot.id),
                eq(championshipMatches.sideBSpotId, spot.id)
              )
            )
          )
          .limit(1);
        if (!match) {
          blockers.push(`Nenhuma partida está ligada a ${spot.label}`);
          continue;
        }
        const [result] = await database
          .select()
          .from(championshipMatchResultRevisions)
          .where(
            and(
              eq(
                championshipMatchResultRevisions.championshipMatchId,
                match.id
              ),
              eq(championshipMatchResultRevisions.state, "current")
            )
          );
        if (!result || result.sideAOutcome === "draw") {
          blockers.push(
            `O resultado de ${match.label} ainda não está definido`
          );
          continue;
        }
        const winnerId =
          result.sideAOutcome === "win"
            ? result.sideATeamId
            : result.sideBTeamId;
        const loserId =
          result.sideAOutcome === "loss"
            ? result.sideATeamId
            : result.sideBTeamId;
        teamId = policy.outcome === "winner" ? winnerId : loserId;
      }
      if (!teamId) {
        blockers.push(`${spot.label} ainda não tem equipe`);
        continue;
      }
      const [team] = await database
        .select()
        .from(championshipTeams)
        .where(eq(championshipTeams.id, teamId));
      if (!team) continue;
      const target = await honorTeamTarget(
        database,
        team,
        version.recipientTypes
      );
      if (!target) {
        blockers.push(
          `${team.name} não tem uma identidade compatível com este título`
        );
        continue;
      }
      contenders.push({
        target,
        displayLabel: team.name,
        rank: contenders.length + 1,
        value: null,
        tied: false
      });
    }
    explanation = `Resultado baseado ${policy.outcome === "occupant" ? "no spot configurado" : "no resultado da partida configurada"}.`;
  } else {
    const currentResults = await database
      .select({ id: championshipMatchResultRevisions.id })
      .from(championshipMatchResultRevisions)
      .where(
        and(
          eq(championshipMatchResultRevisions.championshipId, championshipId),
          eq(championshipMatchResultRevisions.state, "current")
        )
      );
    if (!currentResults.length)
      blockers.push("Ainda não há estatísticas oficiais disponíveis");
    const mappings = await database
      .select({ sourceMetricKey: championshipMetricMappings.sourceMetricKey })
      .from(championshipMetricMappings)
      .where(
        and(
          eq(championshipMetricMappings.championshipId, championshipId),
          eq(championshipMetricMappings.canonicalMetricKey, policy.metricKey)
        )
      );
    const metricKeys = [
      ...new Set([
        policy.metricKey,
        ...mappings.map((row) => row.sourceMetricKey)
      ])
    ];
    if (
      currentResults.length &&
      version.recipientTypes.includes("participant")
    ) {
      const rows = await database
        .select({
          participant: championshipParticipants,
          value: sql<number>`sum(${championshipStatisticEntries.numericValue})`
        })
        .from(championshipStatisticEntries)
        .innerJoin(
          championshipParticipants,
          eq(
            championshipStatisticEntries.participantId,
            championshipParticipants.id
          )
        )
        .where(
          and(
            eq(championshipStatisticEntries.championshipId, championshipId),
            inArray(
              championshipStatisticEntries.resultRevisionId,
              currentResults.map(({ id }) => id)
            ),
            inArray(championshipStatisticEntries.metricKey, metricKeys)
          )
        )
        .groupBy(championshipParticipants.id)
        .orderBy(
          policy.direction === "highest"
            ? desc(sql`sum(${championshipStatisticEntries.numericValue})`)
            : asc(sql`sum(${championshipStatisticEntries.numericValue})`),
          asc(championshipParticipants.id)
        )
        .limit(Math.min(128, policy.limit));
      contenders = rankMetricRows(
        rows.map(({ participant, value }) => ({
          target: { type: "participant" as const, uuid: participant.uuid },
          displayLabel: participant.displayNameSnapshot,
          value: Number(value)
        }))
      );
    } else if (
      currentResults.length &&
      (version.recipientTypes.includes("team") ||
        version.recipientTypes.includes("team-identity"))
    ) {
      const rows = await database
        .select({
          team: championshipTeams,
          value: sql<number>`sum(${championshipStatisticEntries.numericValue})`
        })
        .from(championshipStatisticEntries)
        .innerJoin(
          championshipTeams,
          eq(championshipStatisticEntries.teamId, championshipTeams.id)
        )
        .where(
          and(
            eq(championshipStatisticEntries.championshipId, championshipId),
            inArray(
              championshipStatisticEntries.resultRevisionId,
              currentResults.map(({ id }) => id)
            ),
            inArray(championshipStatisticEntries.metricKey, metricKeys)
          )
        )
        .groupBy(championshipTeams.id)
        .orderBy(
          policy.direction === "highest"
            ? desc(sql`sum(${championshipStatisticEntries.numericValue})`)
            : asc(sql`sum(${championshipStatisticEntries.numericValue})`),
          asc(championshipTeams.id)
        )
        .limit(Math.min(128, policy.limit));
      const rankedTeams: Array<{
        target: HonorTarget;
        displayLabel: string;
        value: number;
      }> = [];
      for (const { team, value } of rows) {
        const target = await honorTeamTarget(
          database,
          team,
          version.recipientTypes
        );
        if (target)
          rankedTeams.push({
            target,
            displayLabel: team.name,
            value: Number(value)
          });
      }
      contenders = rankMetricRows(rankedTeams);
    }
    if (!contenders.length && !blockers.length)
      blockers.push(
        "A estatística configurada ainda não tem valores elegíveis"
      );
    explanation = `${policy.direction === "highest" ? "Maior" : "Menor"} valor de ${policy.metricKey} entre os participantes elegíveis.`;
  }

  const limited = contenders.slice(0, version.maximumRecipients);
  if (limited.length < version.minimumRecipients && !blockers.length) {
    blockers.push("Ainda não há vencedores elegíveis em quantidade suficiente");
  }
  return {
    honorUuid: honor.uuid,
    policy,
    ready: blockers.length === 0 && limited.length >= version.minimumRecipients,
    explanation,
    blockers,
    contenders: limited
  };
}

async function honorTeamTarget(
  database: DatabaseExecutor,
  team: typeof championshipTeams.$inferSelect,
  recipientTypes: Array<HonorTarget["type"]>
): Promise<HonorTarget | null> {
  if (recipientTypes.includes("team")) return { type: "team", uuid: team.uuid };
  if (recipientTypes.includes("team-identity") && team.teamIdentityId) {
    const [identity] = await database
      .select({ uuid: championshipTeamIdentities.uuid })
      .from(championshipTeamIdentities)
      .where(eq(championshipTeamIdentities.id, team.teamIdentityId));
    return identity ? { type: "team-identity", uuid: identity.uuid } : null;
  }
  return null;
}

function rankMetricRows(
  rows: Array<{ target: HonorTarget; displayLabel: string; value: number }>
): ResolutionContender[] {
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.value !== rows[index - 1]!.value) rank = index + 1;
    return {
      ...row,
      rank,
      tied: rows.some(
        (other, otherIndex) => otherIndex !== index && other.value === row.value
      )
    };
  });
}

async function requireDefinition(database: DatabaseExecutor, uuid: string) {
  const [definition] = await database
    .select()
    .from(championshipHonorDefinitions)
    .where(eq(championshipHonorDefinitions.uuid, uuid));
  if (!definition) throw notFound("Honor definition not found");
  return definition;
}

async function requireHonor(
  database: DatabaseExecutor,
  championshipId: number,
  uuid: string
) {
  const [honor] = await database
    .select()
    .from(championshipHonors)
    .where(
      and(
        eq(championshipHonors.uuid, uuid),
        eq(championshipHonors.championshipId, championshipId)
      )
    );
  if (!honor) throw notFound("Championship honor not found");
  return honor;
}

async function projectDefinition(
  database: DatabaseExecutor,
  definition: typeof championshipHonorDefinitions.$inferSelect
): Promise<ChampionshipHonorDefinitionResponse> {
  const [draft] = await database
    .select()
    .from(championshipHonorDefinitionDrafts)
    .where(eq(championshipHonorDefinitionDrafts.definitionId, definition.id));
  if (!draft) throw notFound("Honor definition draft not found");
  const versions = await database
    .select()
    .from(championshipHonorDefinitionVersions)
    .where(eq(championshipHonorDefinitionVersions.definitionId, definition.id))
    .orderBy(desc(championshipHonorDefinitionVersions.version));
  const [competitionType] = await database
    .select()
    .from(championshipCompetitionTypes)
    .where(eq(championshipCompetitionTypes.id, definition.competitionTypeId));
  if (!competitionType) throw notFound("Competition type not found");
  return {
    uuid: definition.uuid,
    slug: definition.slug,
    competitionType: {
      uuid: competitionType.uuid,
      slug: competitionType.slug,
      name: competitionType.name
    },
    kind: definition.kind,
    state: definition.state,
    revision: definition.revision,
    draft: {
      ...definitionFields(draft),
      revision: draft.revision,
      updatedAt: draft.updatedAt
    },
    versions: versions.map((version) => ({
      uuid: version.uuid,
      version: version.version,
      ...definitionFields(version),
      publishedAt: version.publishedAt
    })),
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt
  };
}

async function projectHonor(
  database: DatabaseExecutor,
  honor: typeof championshipHonors.$inferSelect
): Promise<ChampionshipHonorResponse> {
  const [joined] = await database
    .select({
      version: championshipHonorDefinitionVersions,
      definition: championshipHonorDefinitions
    })
    .from(championshipHonorDefinitionVersions)
    .innerJoin(
      championshipHonorDefinitions,
      eq(
        championshipHonorDefinitionVersions.definitionId,
        championshipHonorDefinitions.id
      )
    )
    .where(
      eq(championshipHonorDefinitionVersions.id, honor.definitionVersionId)
    );
  if (!joined) throw notFound("Honor definition version not found");
  const grants = await database
    .select()
    .from(championshipHonorGrants)
    .where(eq(championshipHonorGrants.honorId, honor.id))
    .orderBy(
      asc(championshipHonorGrants.rank),
      asc(championshipHonorGrants.id)
    );
  return {
    uuid: honor.uuid,
    state: honor.state,
    revision: honor.revision,
    displayOrder: honor.displayOrder,
    name: honor.nameOverride ?? joined.version.name,
    description: honor.descriptionOverride ?? joined.version.description,
    kind: joined.definition.kind,
    definition: {
      uuid: joined.definition.uuid,
      slug: joined.definition.slug,
      versionUuid: joined.version.uuid,
      version: joined.version.version,
      recipientTypes: joined.version.recipientTypes,
      minimumRecipients: joined.version.minimumRecipients,
      maximumRecipients: joined.version.maximumRecipients,
      aggregateByIdentity: joined.version.aggregateByIdentity,
      presentation: joined.version.presentation
    },
    decisionPolicy: honor.decisionPolicy,
    grants: await Promise.all(
      grants.map((grant) => projectGrant(database, grant))
    ),
    announcedAt: honor.announcedAt,
    awardedAt: honor.awardedAt,
    voidedAt: honor.voidedAt,
    createdAt: honor.createdAt,
    updatedAt: honor.updatedAt
  };
}

async function projectGrant(
  database: DatabaseExecutor,
  grant: typeof championshipHonorGrants.$inferSelect
) {
  const identity = grant.teamIdentityIdSnapshot
    ? (
        await database
          .select()
          .from(championshipTeamIdentities)
          .where(
            eq(championshipTeamIdentities.id, grant.teamIdentityIdSnapshot)
          )
      )[0]
    : null;
  return {
    uuid: grant.uuid,
    target: {
      type: grant.targetType,
      uuid: await grantTargetUuid(database, grant)
    },
    displayLabel: grant.displayLabelSnapshot,
    identitySnapshot: identity
      ? { uuid: identity.uuid, name: identity.name }
      : null,
    rank: grant.rank,
    note: grant.note,
    awardedAt: grant.awardedAt,
    revokedAt: grant.revokedAt,
    revocationReason: grant.revocationReason
  };
}

async function resolveHonorTarget(
  database: DatabaseExecutor,
  championshipId: number,
  target: HonorTarget
) {
  const empty = {
    teamId: null,
    participantId: null,
    accountId: null,
    historicalPlayerIdentityId: null
  };
  if (target.type === "team") {
    const [row] = await database
      .select()
      .from(championshipTeams)
      .where(
        and(
          eq(championshipTeams.uuid, target.uuid),
          eq(championshipTeams.championshipId, championshipId)
        )
      );
    if (!row) throw notFound("Championship team not found");
    return {
      columns: { ...empty, teamId: row.id },
      identitySnapshotId: row.teamIdentityId,
      label: row.name,
      targetId: row.id
    };
  }
  if (target.type === "team-identity") {
    const [row] = await database
      .select()
      .from(championshipTeamIdentities)
      .where(eq(championshipTeamIdentities.uuid, target.uuid));
    if (!row) throw notFound("Team identity not found");
    return {
      columns: empty,
      identitySnapshotId: row.id,
      label: row.name,
      targetId: row.id
    };
  }
  if (target.type === "participant") {
    const [row] = await database
      .select()
      .from(championshipParticipants)
      .where(
        and(
          eq(championshipParticipants.uuid, target.uuid),
          eq(championshipParticipants.championshipId, championshipId)
        )
      );
    if (!row) throw notFound("Championship participant not found");
    return {
      columns: { ...empty, participantId: row.id },
      identitySnapshotId: null,
      label: row.displayNameSnapshot,
      targetId: row.id
    };
  }
  if (target.type === "account") {
    const [row] = await database
      .select()
      .from(accounts)
      .where(eq(accounts.uuid, target.uuid));
    if (!row) throw notFound("Account not found");
    return {
      columns: { ...empty, accountId: row.id },
      identitySnapshotId: null,
      label: row.name,
      targetId: row.id
    };
  }
  const [row] = await database
    .select()
    .from(championshipHistoricalPlayerIdentities)
    .where(eq(championshipHistoricalPlayerIdentities.uuid, target.uuid));
  if (!row) throw notFound("Historical player identity not found");
  return {
    columns: { ...empty, historicalPlayerIdentityId: row.id },
    identitySnapshotId: null,
    label: row.displayName,
    targetId: row.id
  };
}

function targetMatches(
  grant: typeof championshipHonorGrants.$inferSelect,
  type: HonorTarget["type"],
  target: { targetId: number; identitySnapshotId: number | null }
) {
  if (type === "team") return grant.teamId === target.targetId;
  if (type === "team-identity")
    return grant.teamIdentityIdSnapshot === target.targetId;
  if (type === "participant") return grant.participantId === target.targetId;
  if (type === "account") return grant.accountId === target.targetId;
  return grant.historicalPlayerIdentityId === target.targetId;
}

async function grantTargetUuid(
  database: DatabaseExecutor,
  grant: typeof championshipHonorGrants.$inferSelect
) {
  if (grant.targetType === "team")
    return (
      await database
        .select({ uuid: championshipTeams.uuid })
        .from(championshipTeams)
        .where(eq(championshipTeams.id, grant.teamId!))
    )[0]!.uuid;
  if (grant.targetType === "team-identity")
    return (
      await database
        .select({ uuid: championshipTeamIdentities.uuid })
        .from(championshipTeamIdentities)
        .where(eq(championshipTeamIdentities.id, grant.teamIdentityIdSnapshot!))
    )[0]!.uuid;
  if (grant.targetType === "participant")
    return (
      await database
        .select({ uuid: championshipParticipants.uuid })
        .from(championshipParticipants)
        .where(eq(championshipParticipants.id, grant.participantId!))
    )[0]!.uuid;
  if (grant.targetType === "account")
    return (
      await database
        .select({ uuid: accounts.uuid })
        .from(accounts)
        .where(eq(accounts.id, grant.accountId!))
    )[0]!.uuid;
  return (
    await database
      .select({ uuid: championshipHistoricalPlayerIdentities.uuid })
      .from(championshipHistoricalPlayerIdentities)
      .where(
        eq(
          championshipHistoricalPlayerIdentities.id,
          grant.historicalPlayerIdentityId!
        )
      )
  )[0]!.uuid;
}

function samePublishedDefinition(
  version: typeof championshipHonorDefinitionVersions.$inferSelect,
  draft: typeof championshipHonorDefinitionDrafts.$inferSelect
) {
  return (
    JSON.stringify(definitionFields(version)) ===
    JSON.stringify(definitionFields(draft))
  );
}

async function auditDefinition(
  database: DatabaseExecutor,
  definitionId: number,
  actorAccountId: number,
  action: string,
  before: unknown,
  after: unknown
) {
  await database.insert(championshipHonorDefinitionAuditEvents).values({
    definitionId,
    actorAccountId,
    action,
    before,
    after
  });
}
