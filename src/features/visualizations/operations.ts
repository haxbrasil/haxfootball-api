import { and, asc, desc, eq } from "drizzle-orm";
import { db, withDatabaseTransaction } from "@/db/client";
import { getChampionshipWithType } from "@/features/championships/_shared/db/queries";
import { getChampionshipStatistics } from "@/features/championships/matches-statistics/statistics";
import { eventSchemaVersions } from "@/features/event-schemas/db";
import { getMatchMetrics } from "@/features/match-events/get-match-metrics";
import { listMatchEventsByMatchIds } from "@/features/match-events/_shared/db/queries";
import { matches } from "@/features/matches/db";
import { resolveLogicalMatch } from "@/features/matches/resolve-logical-match";
import { badRequest, conflict, notFound } from "@/shared/http/errors";
import {
  championshipVisualizationInstances,
  visualizationAuditEvents,
  visualizationTemplateCompatibilities,
  visualizationTemplateDrafts,
  visualizationTemplateFamilies,
  visualizationTemplateVersions,
  type VisualizationSpec
} from "@/features/visualizations/db";
import {
  executePipeline,
  validateVisualizationSpecification,
  visualizationLimits,
  type DataRow
} from "@/features/visualizations/pipeline";
import { compileVisualization } from "@/features/visualizations/compiler";

export type TemplateInput = {
  name: string;
  title: string;
  description?: string | null;
  scope: "match" | "championship";
  tags?: string[];
  internalNotes?: string | null;
  specification: VisualizationSpec;
  actorAccountUuid?: string;
};

type TemplateMetadata = Pick<
  TemplateInput,
  "name" | "title" | "description" | "scope"
>;

export async function listVisualizationTemplates(
  scope?: "match" | "championship",
  includeArchived = false
) {
  const rows = await db
    .select()
    .from(visualizationTemplateFamilies)
    .orderBy(asc(visualizationTemplateFamilies.title));
  const families = rows.filter(
    (row) =>
      (!scope || row.scope === scope) &&
      (includeArchived || row.state === "active")
  );
  return {
    items: await Promise.all(families.map(readTemplate)),
    totalCount: families.length,
    truncated: false
  };
}

export async function createVisualizationTemplate(input: TemplateInput) {
  validateVisualizationSpecification(input.specification);
  return withDatabaseTransaction(async (tx) => {
    const [family] = await tx
      .insert(visualizationTemplateFamilies)
      .values({
        name: input.name,
        title: input.title,
        description: input.description ?? null,
        scope: input.scope,
        tags: input.tags ?? [],
        internalNotes: input.internalNotes ?? null
      })
      .returning();
    const [draft] = await tx
      .insert(visualizationTemplateDrafts)
      .values({
        familyId: family.id,
        specification: input.specification,
        name: family.name,
        title: family.title,
        description: family.description,
        scope: family.scope
      })
      .returning();
    await tx.insert(visualizationAuditEvents).values({
      familyId: family.id,
      action: "visualization-template.created",
      actorAccountUuid: input.actorAccountUuid,
      after: { family, draft }
    });
    return toTemplate(family, draft, []);
  });
}

export async function updateVisualizationDraft(
  uuid: string,
  input: {
    specification: VisualizationSpec;
    name: string;
    title: string;
    description?: string | null;
    scope: "match" | "championship";
    expectedRevision: number;
    actorAccountUuid?: string;
  }
) {
  validateVisualizationSpecification(input.specification);
  validateTemplateMetadata(input);
  return withDatabaseTransaction(async (tx) => {
    const family = await requireFamily(tx, uuid);
    const [draft] = await tx
      .select()
      .from(visualizationTemplateDrafts)
      .where(eq(visualizationTemplateDrafts.familyId, family.id));
    if (!draft) throw notFound("Visualization draft not found");
    if (draft.revision !== input.expectedRevision)
      throw conflict("Visualization draft revision conflict", {
        currentRevision: draft.revision
      });
    const metadata: TemplateMetadata = {
      name: input.name,
      title: input.title,
      description: input.description ?? null,
      scope: input.scope
    };
    if (
      JSON.stringify(draft.specification) ===
        JSON.stringify(input.specification) &&
      draft.name === metadata.name &&
      draft.title === metadata.title &&
      draft.description === metadata.description &&
      draft.scope === metadata.scope
    )
      return toTemplate(family, draft, await versionsFor(tx, family.id));
    const [updated] = await tx
      .update(visualizationTemplateDrafts)
      .set({
        specification: input.specification,
        ...metadata,
        revision: draft.revision + 1,
        updatedAt: new Date().toISOString()
      })
      .where(eq(visualizationTemplateDrafts.id, draft.id))
      .returning();
    const [updatedFamily] = await tx
      .update(visualizationTemplateFamilies)
      .set({
        ...metadata,
        revision: family.revision + 1,
        updatedAt: new Date().toISOString()
      })
      .where(eq(visualizationTemplateFamilies.id, family.id))
      .returning();
    await tx.insert(visualizationAuditEvents).values({
      familyId: family.id,
      action: "visualization-template.draft-updated",
      actorAccountUuid: input.actorAccountUuid,
      before: { family, draft },
      after: { family: updatedFamily, draft: updated }
    });
    return toTemplate(updatedFamily, updated, await versionsFor(tx, family.id));
  });
}

export async function publishVisualizationTemplate(
  uuid: string,
  input: { expectedRevision: number; actorAccountUuid?: string }
) {
  return withDatabaseTransaction(async (tx) => {
    const family = await requireFamily(tx, uuid);
    const [draft] = await tx
      .select()
      .from(visualizationTemplateDrafts)
      .where(eq(visualizationTemplateDrafts.familyId, family.id));
    if (!draft) throw notFound("Visualization draft not found");
    if (draft.revision !== input.expectedRevision)
      throw conflict("Visualization draft revision conflict", {
        currentRevision: draft.revision
      });
    validateVisualizationSpecification(draft.specification);
    const versions = await versionsFor(tx, family.id);
    const latest = versions[0];
    if (
      latest &&
      JSON.stringify(latest.specification) ===
        JSON.stringify(draft.specification) &&
      latest.name === draft.name &&
      latest.title === draft.title &&
      latest.description === draft.description &&
      latest.scope === draft.scope
    )
      return { ...toTemplate(family, draft, versions), published: false };
    const [version] = await tx
      .insert(visualizationTemplateVersions)
      .values({
        familyId: family.id,
        version: (versions[0]?.version ?? 0) + 1,
        specification: draft.specification,
        name: draft.name,
        title: draft.title,
        description: draft.description,
        scope: draft.scope
      })
      .returning();
    await tx.insert(visualizationAuditEvents).values({
      familyId: family.id,
      action: "visualization-template.published",
      actorAccountUuid: input.actorAccountUuid,
      after: version
    });
    return {
      ...toTemplate(family, draft, [version, ...versions]),
      published: true
    };
  });
}

export async function previewVisualization(input: {
  specification: VisualizationSpec;
  datasets?: Record<string, DataRow[]>;
}) {
  validateVisualizationSpecification(input.specification);
  return renderSpecification(
    input.specification,
    input.datasets ?? syntheticSources()
  );
}

export async function getMatchVisualizations(matchId: string) {
  const logical = await resolveLogicalMatch(matchId);
  const first = logical.firstMatch;
  const [binding] = await db
    .select({
      gameModeId: matches.gameModeId,
      schemaVersionId: matches.eventSchemaVersionId
    })
    .from(matches)
    .where(eq(matches.id, first.id));
  const schemaFamilyId = binding?.schemaVersionId
    ? (
        await db
          .select({ familyId: eventSchemaVersions.familyId })
          .from(eventSchemaVersions)
          .where(eq(eventSchemaVersions.id, binding.schemaVersionId))
      )[0]?.familyId
    : null;
  const templates = await publishedTemplates("match");
  const compatible = templates.filter(
    (template) =>
      template.compatibilities.length === 0 ||
      template.compatibilities.some(
        (item) =>
          (!item.gameModeId || item.gameModeId === binding?.gameModeId) &&
          (!item.eventSchemaFamilyId ||
            item.eventSchemaFamilyId === schemaFamilyId)
      )
  );
  const metrics = await getMatchMetrics(matchId);
  const events = await listMatchEventsByMatchIds(
    logical.rounds.map((round) => round.match.id)
  );
  const overall = Array.isArray(metrics) ? metrics : metrics.overall;
  const sources: Record<string, DataRow[]> = {
    playerMetrics: overall.map((row) => ({
      playerId: row.player.id,
      player: row.player.name,
      ...row.metrics
    })),
    events: events.map((event) => ({
      type: event.type,
      domain: event.domain,
      team: event.team,
      elapsedSeconds: event.elapsedSeconds,
      occurredAt: event.occurredAt,
      actor: event.actorPlayer?.externalId ?? null,
      subject: event.subjectPlayer?.externalId ?? null,
      ...(typeof event.value === "object" && event.value
        ? (event.value as Record<string, unknown>)
        : { value: event.value })
    })),
    rounds: Array.isArray(metrics)
      ? []
      : metrics.rounds.flatMap((round) =>
          round.metrics.map((row) => ({
            round:
              round.round.kind === "sequential"
                ? round.round.number
                : "extra-time",
            playerId: row.player.id,
            player: row.player.name,
            ...row.metrics
          }))
        )
  };
  return boundedDashboard(
    compatible.map((template) => safeRenderTemplate(template, sources))
  );
}

export async function getChampionshipVisualizations(
  championshipUuid: string,
  surface: "overview" | "statistics",
  actorAccountUuid?: string
) {
  const context = await getChampionshipWithType(db, championshipUuid);
  const instances = await db
    .select({
      instance: championshipVisualizationInstances,
      version: visualizationTemplateVersions,
      family: visualizationTemplateFamilies
    })
    .from(championshipVisualizationInstances)
    .innerJoin(
      visualizationTemplateVersions,
      eq(
        championshipVisualizationInstances.templateVersionId,
        visualizationTemplateVersions.id
      )
    )
    .innerJoin(
      visualizationTemplateFamilies,
      eq(
        visualizationTemplateVersions.familyId,
        visualizationTemplateFamilies.id
      )
    )
    .where(
      and(
        eq(
          championshipVisualizationInstances.championshipId,
          context.championship.id
        ),
        eq(championshipVisualizationInstances.surface, surface),
        eq(championshipVisualizationInstances.visibility, "published")
      )
    )
    .orderBy(asc(championshipVisualizationInstances.displayOrder));
  const statistics = await getChampionshipStatistics(championshipUuid, {
    limit: 500,
    actorAccountUuid
  });
  const sources: Record<string, DataRow[]> = {
    teams: statistics.teams.items.flatMap((row) =>
      row.team
        ? [
            {
              teamId: row.team.uuid,
              team: row.team.name,
              played: row.played,
              wins: row.wins,
              draws: row.draws,
              losses: row.losses,
              pointsFor: row.pointsFor,
              pointsAgainst: row.pointsAgainst,
              differential: row.differential
            }
          ]
        : []
    ),
    players: statistics.players.items.map((row) => ({
      participantId: row.participantUuid,
      accountId: row.accountUuid,
      player: row.displayName,
      matchesPlayed: row.matchesPlayed,
      playingTimeSeconds: row.playingTimeSeconds,
      ...row.metrics
    }))
  };
  return boundedDashboard(
    instances
      .slice(0, visualizationLimits.chartsPerSurface)
      .map(({ instance, version, family }) => ({
        ...safeRenderTemplate(
          { family, version, compatibilities: [] },
          sources
        ),
        id: instance.uuid,
        title: instance.titleOverride ?? version.title,
        layout: { width: instance.width, height: instance.height },
        revision: instance.revision
      }))
  );
}

export async function getChampionshipVisualizationConfiguration(
  championshipUuid: string
) {
  const context = await getChampionshipWithType(db, championshipUuid);
  const instances = await db
    .select({
      instance: championshipVisualizationInstances,
      version: visualizationTemplateVersions,
      family: visualizationTemplateFamilies
    })
    .from(championshipVisualizationInstances)
    .innerJoin(
      visualizationTemplateVersions,
      eq(
        championshipVisualizationInstances.templateVersionId,
        visualizationTemplateVersions.id
      )
    )
    .innerJoin(
      visualizationTemplateFamilies,
      eq(
        visualizationTemplateVersions.familyId,
        visualizationTemplateFamilies.id
      )
    )
    .where(
      eq(
        championshipVisualizationInstances.championshipId,
        context.championship.id
      )
    )
    .orderBy(
      asc(championshipVisualizationInstances.surface),
      asc(championshipVisualizationInstances.displayOrder)
    );
  const templates = await publishedTemplates("championship");
  return {
    instances: instances.map(({ instance, version, family }) => ({
      ...instance,
      id: instance.uuid,
      template: {
        id: family.uuid,
        title: version.title,
        version: version.version,
        templateVersionId: version.id
      }
    })),
    templates: templates.map(({ family, version }) => ({
      id: family.uuid,
      title: version.title,
      description: version.description,
      version: version.version,
      templateVersionId: version.id
    }))
  };
}

export async function upsertChampionshipVisualization(
  championshipUuid: string,
  input: {
    uuid?: string;
    templateVersionId: number;
    surface: "overview" | "statistics";
    displayOrder?: number;
    width?: "compact" | "half" | "full";
    height?: "short" | "medium" | "tall" | "viewport";
    titleOverride?: string | null;
    overrides?: Record<string, unknown>;
    visibility?: "draft" | "published";
    expectedRevision?: number;
    actorAccountUuid?: string;
  }
) {
  return withDatabaseTransaction(async (tx) => {
    const context = await getChampionshipWithType(tx, championshipUuid);
    if (input.uuid) {
      const [existing] = await tx
        .select()
        .from(championshipVisualizationInstances)
        .where(
          and(
            eq(championshipVisualizationInstances.uuid, input.uuid),
            eq(
              championshipVisualizationInstances.championshipId,
              context.championship.id
            )
          )
        );
      if (!existing) throw notFound("Championship visualization not found");
      if (existing.revision !== input.expectedRevision)
        throw conflict("Championship visualization revision conflict", {
          currentRevision: existing.revision
        });
      const [updated] = await tx
        .update(championshipVisualizationInstances)
        .set({
          templateVersionId: input.templateVersionId,
          surface: input.surface,
          displayOrder: input.displayOrder ?? existing.displayOrder,
          width: input.width ?? existing.width,
          height: input.height ?? existing.height,
          titleOverride: input.titleOverride ?? null,
          overrides: input.overrides ?? {},
          visibility: input.visibility ?? existing.visibility,
          revision: existing.revision + 1,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championshipVisualizationInstances.id, existing.id))
        .returning();
      await tx.insert(visualizationAuditEvents).values({
        championshipId: context.championship.id,
        action: "championship-visualization.updated",
        actorAccountUuid: input.actorAccountUuid,
        before: existing,
        after: updated
      });
      return updated;
    }
    const [created] = await tx
      .insert(championshipVisualizationInstances)
      .values({
        championshipId: context.championship.id,
        templateVersionId: input.templateVersionId,
        surface: input.surface,
        displayOrder: input.displayOrder ?? 0,
        width: input.width ?? "half",
        height: input.height ?? "medium",
        titleOverride: input.titleOverride ?? null,
        overrides: input.overrides ?? {},
        visibility: input.visibility ?? "draft"
      })
      .returning();
    await tx.insert(visualizationAuditEvents).values({
      championshipId: context.championship.id,
      action: "championship-visualization.created",
      actorAccountUuid: input.actorAccountUuid,
      after: created
    });
    return created;
  });
}

async function publishedTemplates(scope: "match" | "championship") {
  const families = await db
    .select()
    .from(visualizationTemplateFamilies)
    .where(
      and(
        eq(visualizationTemplateFamilies.scope, scope),
        eq(visualizationTemplateFamilies.state, "active")
      )
    );
  return Promise.all(
    families.map(async (family) => {
      const [version] = await db
        .select()
        .from(visualizationTemplateVersions)
        .where(eq(visualizationTemplateVersions.familyId, family.id))
        .orderBy(desc(visualizationTemplateVersions.version))
        .limit(1);
      const compatibilities = await db
        .select()
        .from(visualizationTemplateCompatibilities)
        .where(eq(visualizationTemplateCompatibilities.familyId, family.id));
      return version ? { family, version, compatibilities } : null;
    })
  ).then((items) =>
    items.filter((item): item is NonNullable<typeof item> => !!item)
  );
}

function renderTemplate(
  template: {
    family: typeof visualizationTemplateFamilies.$inferSelect;
    version: typeof visualizationTemplateVersions.$inferSelect;
    compatibilities: Array<
      typeof visualizationTemplateCompatibilities.$inferSelect
    >;
  },
  sources: Record<string, DataRow[]>
) {
  return {
    id: template.family.uuid,
    title: template.version.title,
    description: template.version.description,
    version: template.version.version,
    ...renderSpecification(template.version.specification, sources)
  };
}

function safeRenderTemplate(
  template: Parameters<typeof renderTemplate>[0],
  sources: Record<string, DataRow[]>
) {
  try {
    return renderTemplate(template, sources);
  } catch (error) {
    return {
      id: template.family.uuid,
      title: template.version.title,
      description: template.version.description,
      version: template.version.version,
      option: {},
      datasets: [],
      accessibility: { table: true },
      interactions: {},
      renderError:
        error instanceof Error
          ? error.message
          : "Visualization could not render"
    };
  }
}

function renderSpecification(
  specification: VisualizationSpec,
  sources: Record<string, DataRow[]>
) {
  const datasets = specification.datasets.map((dataset) => ({
    id: dataset.id,
    rows: executePipeline(
      sources[dataset.source] ?? [],
      dataset.operations ?? []
    )
  }));
  return {
    option: compileVisualization(specification, datasets),
    datasets,
    accessibility: specification.accessibility ?? { table: true },
    interactions: specification.interactions ?? {}
  };
}

function boundedDashboard(items: unknown[]) {
  const value = { items: items.slice(0, visualizationLimits.chartsPerSurface) };
  const serialized = JSON.stringify(value);
  if (serialized.length > visualizationLimits.bytesPerDashboard)
    throw badRequest("Visualization dashboard exceeds the response budget");
  return value;
}

async function readTemplate(
  family: typeof visualizationTemplateFamilies.$inferSelect
) {
  const [draft] = await db
    .select()
    .from(visualizationTemplateDrafts)
    .where(eq(visualizationTemplateDrafts.familyId, family.id));
  return toTemplate(family, draft ?? null, await versionsFor(db, family.id));
}
function toTemplate(
  family: typeof visualizationTemplateFamilies.$inferSelect,
  draft: typeof visualizationTemplateDrafts.$inferSelect | null,
  versions: Array<typeof visualizationTemplateVersions.$inferSelect>
) {
  const { id: _internalId, uuid, ...metadata } = family;
  return {
    id: uuid,
    ...metadata,
    draft: draft
      ? {
          specification: draft.specification,
          revision: draft.revision,
          updatedAt: draft.updatedAt
        }
      : null,
    versions: versions.map((item) => ({
      id: item.id,
      version: item.version,
      createdAt: item.createdAt
    })),
    latestVersion: versions[0]?.version ?? null
  };
}
async function versionsFor(executor: any, familyId: number) {
  return executor
    .select()
    .from(visualizationTemplateVersions)
    .where(eq(visualizationTemplateVersions.familyId, familyId))
    .orderBy(desc(visualizationTemplateVersions.version));
}
async function requireFamily(executor: any, uuid: string) {
  const [family] = await executor
    .select()
    .from(visualizationTemplateFamilies)
    .where(eq(visualizationTemplateFamilies.uuid, uuid));
  if (!family) throw notFound("Visualization template not found");
  return family as typeof visualizationTemplateFamilies.$inferSelect;
}

function validateTemplateMetadata(value: TemplateMetadata) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(value.name))
    throw badRequest("Visualization template identifier is invalid");
  if (!value.title.trim())
    throw badRequest("Visualization template title is required");
}
function syntheticSources(): Record<string, DataRow[]> {
  return {
    playerMetrics: [
      { player: "Jogador A", value: 42 },
      { player: "Jogador B", value: 31 }
    ],
    players: [
      { player: "Jogador A", value: 42 },
      { player: "Jogador B", value: 31 }
    ],
    teams: [
      { team: "Equipe A", value: 50 },
      { team: "Equipe B", value: 35 }
    ],
    events: []
  };
}
