import { and, asc, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { db, type DatabaseExecutor, withDatabaseTransaction } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  requireChampionshipActor,
  championshipActorHasPermission,
  findChampionshipActor
} from "@/features/championships/core/authorization";
import { championships } from "@/features/championships/core/db";
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
  championshipHonors
} from "@/features/championships/history/db";
import type {
  ArchiveChampionshipHonorDefinitionInput,
  ChampionshipHonorDefinitionResponse,
  ChampionshipHonorResponse,
  ChampionshipHonorsQuery,
  CreateChampionshipHonorDefinitionInput,
  CreateChampionshipHonorGrantInput,
  CreateChampionshipHonorInput,
  ListChampionshipHonorDefinitionsQuery,
  PublishChampionshipHonorDefinitionInput,
  RevokeChampionshipHonorGrantInput,
  UpdateChampionshipHonorDefinitionDraftInput,
  UpdateChampionshipHonorInput
} from "@/features/championships/history/contracts";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse
} from "@lib";
import { badRequest, conflict, forbidden, notFound } from "@/shared/http/errors";

type HonorTarget = {
  type: "team" | "team-identity" | "participant" | "account" | "historical-player";
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
        query.kind ? eq(championshipHonorDefinitions.kind, query.kind) : undefined,
        query.state && query.state !== "all"
          ? eq(championshipHonorDefinitions.state, query.state)
          : undefined
      )
    )
    .orderBy(asc(championshipHonorDefinitions.id))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, (row) => ({ id: row.id }));
  return {
    items: await Promise.all(page.items.map((row) => projectDefinition(db, row))),
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
    const existing = await tx
      .select({ id: championshipHonorDefinitions.id })
      .from(championshipHonorDefinitions)
      .where(eq(championshipHonorDefinitions.slug, input.slug));
    if (existing.length) throw conflict("Honor definition slug is already in use");
    const [definition] = await tx
      .insert(championshipHonorDefinitions)
      .values({
        slug: input.slug,
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
    await auditDefinition(tx, definition.id, actor.account.id, "honor-definition.created", null, {
      definition,
      draft
    });
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
      .where(eq(championshipHonorDefinitionVersions.definitionId, definition.id))
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
      input.archived ? "honor-definition.archived" : "honor-definition.restored",
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
    .where(and(eq(championships.uuid, championshipUuid), isNull(championships.deletedAt)));
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
        .select()
        .from(championshipHonorDefinitionVersions)
        .where(eq(championshipHonorDefinitionVersions.uuid, input.definitionVersionUuid));
      if (!version) throw notFound("Published honor definition version not found");
      validateDecisionPolicy(input.decisionPolicy, version.recipientTypes);
      const now = new Date().toISOString();
      const [honor] = await tx
        .insert(championshipHonors)
        .values({
          championshipId: championship.id,
          definitionVersionId: version.id,
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
        throw badRequest("An awarded honor can only change after its grants are revoked");
      }
      const [version] = await tx
        .select()
        .from(championshipHonorDefinitionVersions)
        .where(eq(championshipHonorDefinitionVersions.id, honor.definitionVersionId));
      if (input.decisionPolicy) validateDecisionPolicy(input.decisionPolicy, version!.recipientTypes);
      const now = new Date().toISOString();
      const nextState = input.state ?? honor.state;
      const [updated] = await tx
        .update(championshipHonors)
        .set({
          state: nextState,
          nameOverride: input.nameOverride === undefined ? honor.nameOverride : input.nameOverride,
          descriptionOverride:
            input.descriptionOverride === undefined
              ? honor.descriptionOverride
              : input.descriptionOverride,
          decisionPolicy: input.decisionPolicy ?? honor.decisionPolicy,
          displayOrder: input.displayOrder ?? honor.displayOrder,
          revision: honor.revision + 1,
          announcedAt:
            nextState === "announced" && !honor.announcedAt ? now : honor.announcedAt,
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
      if (honor.state === "void") throw badRequest("A void honor cannot be awarded");
      const [version] = await tx
        .select()
        .from(championshipHonorDefinitionVersions)
        .where(eq(championshipHonorDefinitionVersions.id, honor.definitionVersionId));
      if (!version!.recipientTypes.includes(input.target.type)) {
        throw badRequest("Target type is not allowed by this honor definition");
      }
      const target = await resolveHonorTarget(tx, championship.id, input.target);
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
        throw badRequest("This honor already has the maximum number of recipients");
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
      const nextState = activeCount >= version!.minimumRecipients ? "awarded" : "deciding";
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
        .where(eq(championshipHonorDefinitionVersions.id, honor.definitionVersionId));
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
    !input.recipientTypes.some((type) => type === "team" || type === "team-identity")
  ) {
    throw badRequest("Identity aggregation requires a team recipient type");
  }
}

function validateDecisionPolicy(
  policy: CreateChampionshipHonorInput["decisionPolicy"],
  recipientTypes: Array<HonorTarget["type"]>
) {
  if (policy.type === "placement" && !recipientTypes.includes("team") && !recipientTypes.includes("team-identity")) {
    throw badRequest("Placement policies require a team recipient type");
  }
  if (policy.type === "metric-ranking" && policy.metricKey.trim().length === 0) {
    throw badRequest("Metric ranking requires a metric key");
  }
}

async function requireDefinition(database: DatabaseExecutor, uuid: string) {
  const [definition] = await database
    .select()
    .from(championshipHonorDefinitions)
    .where(eq(championshipHonorDefinitions.uuid, uuid));
  if (!definition) throw notFound("Honor definition not found");
  return definition;
}

async function requireHonor(database: DatabaseExecutor, championshipId: number, uuid: string) {
  const [honor] = await database
    .select()
    .from(championshipHonors)
    .where(
      and(eq(championshipHonors.uuid, uuid), eq(championshipHonors.championshipId, championshipId))
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
  return {
    uuid: definition.uuid,
    slug: definition.slug,
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
      eq(championshipHonorDefinitionVersions.definitionId, championshipHonorDefinitions.id)
    )
    .where(eq(championshipHonorDefinitionVersions.id, honor.definitionVersionId));
  if (!joined) throw notFound("Honor definition version not found");
  const grants = await database
    .select()
    .from(championshipHonorGrants)
    .where(eq(championshipHonorGrants.honorId, honor.id))
    .orderBy(asc(championshipHonorGrants.rank), asc(championshipHonorGrants.id));
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
    grants: await Promise.all(grants.map((grant) => projectGrant(database, grant))),
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
          .where(eq(championshipTeamIdentities.id, grant.teamIdentityIdSnapshot))
      )[0]
    : null;
  return {
    uuid: grant.uuid,
    target: { type: grant.targetType, uuid: await grantTargetUuid(database, grant) },
    displayLabel: grant.displayLabelSnapshot,
    identitySnapshot: identity ? { uuid: identity.uuid, name: identity.name } : null,
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
      .where(and(eq(championshipTeams.uuid, target.uuid), eq(championshipTeams.championshipId, championshipId)));
    if (!row) throw notFound("Championship team not found");
    return { columns: { ...empty, teamId: row.id }, identitySnapshotId: row.teamIdentityId, label: row.name, targetId: row.id };
  }
  if (target.type === "team-identity") {
    const [row] = await database
      .select()
      .from(championshipTeamIdentities)
      .where(eq(championshipTeamIdentities.uuid, target.uuid));
    if (!row) throw notFound("Team identity not found");
    return { columns: empty, identitySnapshotId: row.id, label: row.name, targetId: row.id };
  }
  if (target.type === "participant") {
    const [row] = await database
      .select()
      .from(championshipParticipants)
      .where(and(eq(championshipParticipants.uuid, target.uuid), eq(championshipParticipants.championshipId, championshipId)));
    if (!row) throw notFound("Championship participant not found");
    return { columns: { ...empty, participantId: row.id }, identitySnapshotId: null, label: row.displayNameSnapshot, targetId: row.id };
  }
  if (target.type === "account") {
    const [row] = await database.select().from(accounts).where(eq(accounts.uuid, target.uuid));
    if (!row) throw notFound("Account not found");
    return { columns: { ...empty, accountId: row.id }, identitySnapshotId: null, label: row.name, targetId: row.id };
  }
  const [row] = await database
    .select()
    .from(championshipHistoricalPlayerIdentities)
    .where(eq(championshipHistoricalPlayerIdentities.uuid, target.uuid));
  if (!row) throw notFound("Historical player identity not found");
  return { columns: { ...empty, historicalPlayerIdentityId: row.id }, identitySnapshotId: null, label: row.displayName, targetId: row.id };
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
    return (await database.select({ uuid: championshipTeams.uuid }).from(championshipTeams).where(eq(championshipTeams.id, grant.teamId!)))[0]!.uuid;
  if (grant.targetType === "team-identity")
    return (await database.select({ uuid: championshipTeamIdentities.uuid }).from(championshipTeamIdentities).where(eq(championshipTeamIdentities.id, grant.teamIdentityIdSnapshot!)))[0]!.uuid;
  if (grant.targetType === "participant")
    return (await database.select({ uuid: championshipParticipants.uuid }).from(championshipParticipants).where(eq(championshipParticipants.id, grant.participantId!)))[0]!.uuid;
  if (grant.targetType === "account")
    return (await database.select({ uuid: accounts.uuid }).from(accounts).where(eq(accounts.id, grant.accountId!)))[0]!.uuid;
  return (await database.select({ uuid: championshipHistoricalPlayerIdentities.uuid }).from(championshipHistoricalPlayerIdentities).where(eq(championshipHistoricalPlayerIdentities.id, grant.historicalPlayerIdentityId!)))[0]!.uuid;
}

function samePublishedDefinition(
  version: typeof championshipHonorDefinitionVersions.$inferSelect,
  draft: typeof championshipHonorDefinitionDrafts.$inferSelect
) {
  return JSON.stringify(definitionFields(version)) === JSON.stringify(definitionFields(draft));
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
