import { Elysia, t } from "elysia";
import {
  createVisualizationTemplate,
  getChampionshipVisualizations,
  getChampionshipVisualizationConfiguration,
  getMatchVisualizations,
  listVisualizationTemplates,
  previewVisualization,
  publishVisualizationTemplate,
  updateVisualizationDraft,
  upsertChampionshipVisualization
} from "@/features/visualizations/operations";

const specificationSchema = t.Unknown();
const templateBodySchema = t.Object({
  name: t.String({
    minLength: 1,
    maxLength: 64,
    pattern: "^[a-z][a-z0-9-]{0,63}$"
  }),
  title: t.String({ minLength: 1, maxLength: 160 }),
  description: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
  scope: t.Union([t.Literal("match"), t.Literal("championship")]),
  tags: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: 40 }), { maxItems: 20 })
  ),
  internalNotes: t.Optional(t.Nullable(t.String({ maxLength: 4000 }))),
  specification: specificationSchema,
  actorAccountUuid: t.Optional(t.String({ format: "uuid" }))
});

export const visualizationRoutes = new Elysia({
  name: "visualization-routes",
  prefix: "/visualizations"
})
  .get(
    "/templates",
    ({ query }) =>
      listVisualizationTemplates(query.scope, query.includeArchived === "true"),
    {
      query: t.Object({
        scope: t.Optional(
          t.Union([t.Literal("match"), t.Literal("championship")])
        ),
        includeArchived: t.Optional(t.String())
      }),
      response: { 200: t.Unknown() },
      detail: {
        tags: ["Visualizations"],
        summary: "List visualization templates"
      }
    }
  )
  .post(
    "/templates",
    ({ body, set }) => {
      set.status = 201;
      return createVisualizationTemplate(body as never);
    },
    {
      body: templateBodySchema,
      response: { 201: t.Unknown() },
      detail: {
        tags: ["Visualizations"],
        summary: "Create a visualization template"
      }
    }
  )
  .put(
    "/templates/:id/draft",
    ({ params, body }) => updateVisualizationDraft(params.id, body as never),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        specification: specificationSchema,
        name: t.String({
          minLength: 1,
          maxLength: 64,
          pattern: "^[a-z][a-z0-9-]{0,63}$"
        }),
        title: t.String({ minLength: 1, maxLength: 160 }),
        description: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
        scope: t.Union([t.Literal("match"), t.Literal("championship")]),
        expectedRevision: t.Integer({ minimum: 0 }),
        actorAccountUuid: t.Optional(t.String({ format: "uuid" }))
      }),
      response: { 200: t.Unknown() },
      detail: {
        tags: ["Visualizations"],
        summary: "Update a visualization draft"
      }
    }
  )
  .post(
    "/templates/:id/publish",
    ({ params, body }) => publishVisualizationTemplate(params.id, body),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        expectedRevision: t.Integer({ minimum: 0 }),
        actorAccountUuid: t.Optional(t.String({ format: "uuid" }))
      }),
      response: { 200: t.Unknown() },
      detail: {
        tags: ["Visualizations"],
        summary: "Publish a visualization template"
      }
    }
  )
  .post("/preview", ({ body }) => previewVisualization(body as never), {
    body: t.Object({
      specification: specificationSchema,
      datasets: t.Optional(
        t.Record(t.String(), t.Array(t.Record(t.String(), t.Unknown())))
      )
    }),
    response: { 200: t.Unknown() },
    detail: { tags: ["Visualizations"], summary: "Preview a visualization" }
  })
  .get("/matches/:id", ({ params }) => getMatchVisualizations(params.id), {
    params: t.Object({ id: t.String({ minLength: 1 }) }),
    response: { 200: t.Unknown() },
    detail: {
      tags: ["Visualizations"],
      summary: "Render published match visualizations"
    }
  })
  .get(
    "/championships/:id",
    ({ params, query }) =>
      getChampionshipVisualizations(
        params.id,
        query.surface,
        query.actorAccountUuid
      ),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      query: t.Object({
        surface: t.Union([t.Literal("overview"), t.Literal("statistics")]),
        actorAccountUuid: t.Optional(t.String({ format: "uuid" }))
      }),
      response: { 200: t.Unknown() },
      detail: {
        tags: ["Visualizations"],
        summary: "Render championship visualizations"
      }
    }
  )
  .get(
    "/championships/:id/configuration",
    ({ params }) => getChampionshipVisualizationConfiguration(params.id),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      response: { 200: t.Unknown() },
      detail: {
        tags: ["Visualizations"],
        summary: "Get championship visualization configuration"
      }
    }
  )
  .put(
    "/championships/:id/instances",
    ({ params, body }) => upsertChampionshipVisualization(params.id, body),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        uuid: t.Optional(t.String({ format: "uuid" })),
        templateVersionId: t.Integer({ minimum: 1 }),
        surface: t.Union([t.Literal("overview"), t.Literal("statistics")]),
        displayOrder: t.Optional(t.Integer({ minimum: 0 })),
        width: t.Optional(
          t.Union([t.Literal("compact"), t.Literal("half"), t.Literal("full")])
        ),
        height: t.Optional(
          t.Union([
            t.Literal("short"),
            t.Literal("medium"),
            t.Literal("tall"),
            t.Literal("viewport")
          ])
        ),
        titleOverride: t.Optional(t.Nullable(t.String({ maxLength: 160 }))),
        overrides: t.Optional(t.Record(t.String(), t.Unknown())),
        visibility: t.Optional(
          t.Union([t.Literal("draft"), t.Literal("published")])
        ),
        expectedRevision: t.Optional(t.Integer({ minimum: 0 })),
        actorAccountUuid: t.Optional(t.String({ format: "uuid" }))
      }),
      response: { 200: t.Unknown() },
      detail: {
        tags: ["Visualizations"],
        summary: "Create or update a championship visualization"
      }
    }
  );
