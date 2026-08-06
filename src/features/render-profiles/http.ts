import { Elysia, t } from "elysia";
import {
  listRenderProfiles,
  previewRenderProfile,
  publishRenderProfile,
  updateRenderProfileDraft
} from "@/features/render-profiles/operations";

const settings = t.Object({
  formats: t.Array(
    t.Union([t.Literal("mp4"), t.Literal("webm"), t.Literal("gif")])
  ),
  orientations: t.Array(
    t.Union([t.Literal("landscape"), t.Literal("vertical")])
  ),
  scoreboards: t.Array(t.String()),
  cameras: t.Array(
    t.Object({
      id: t.String({ minLength: 1, maxLength: 80 }),
      title: t.String({ minLength: 1, maxLength: 120 }),
      description: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
      zoom: t.Number(),
      hudZoom: t.Number(),
      scoreboardZoom: t.Number(),
      menuZoom: t.Number(),
      locationIndicatorZoom: t.Number(),
      gameMessageZoom: t.Number(),
      parameters: t.Record(t.String(), t.Number()),
      rules: t.Array(
        t.Object({
          when: t.String(),
          condition: t.Optional(
            t.Object({
              combination: t.Union([t.Literal("all"), t.Literal("any")]),
              clauses: t.Array(
                t.Object({
                  field: t.String({ minLength: 1, maxLength: 80 }),
                  operator: t.Union([
                    t.Literal("eq"),
                    t.Literal("neq"),
                    t.Literal("gt"),
                    t.Literal("gte"),
                    t.Literal("lt"),
                    t.Literal("lte")
                  ]),
                  value: t.Union([t.String(), t.Number(), t.Boolean()])
                })
              )
            })
          ),
          focus: t.Optional(t.Object({ target: t.Literal("players") })),
          set: t.Optional(t.Record(t.String(), t.Number()))
        })
      )
    })
  )
});
export const renderProfileRoutes = new Elysia({
  name: "render-profile-routes",
  prefix: "/render-profiles"
})
  .get("", () => listRenderProfiles(), {
    response: { 200: t.Array(t.Unknown()) },
    detail: { tags: ["Render profiles"], summary: "List render profiles" }
  })
  .put(
    "/:id/draft",
    ({ params, body }) => updateRenderProfileDraft(params.id, body),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 120 }),
        description: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
        settings,
        expectedRevision: t.Integer({ minimum: 0 })
      }),
      response: { 200: t.Unknown() }
    }
  )
  .post(
    "/:id/preview",
    ({ params, body }) =>
      previewRenderProfile({ profileId: params.id, ...body }),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        clipId: t.String({ format: "uuid" }),
        format: t.Union([
          t.Literal("mp4"),
          t.Literal("webm"),
          t.Literal("gif")
        ]),
        orientation: t.Union([t.Literal("landscape"), t.Literal("vertical")]),
        scoreboard: t.String(),
        cameraId: t.String({ minLength: 1, maxLength: 80 }),
        settings: t.Optional(settings)
      }),
      response: { 200: t.Unknown() }
    }
  )
  .post(
    "/:id/publish",
    ({ params, body }) =>
      publishRenderProfile(params.id, body.expectedRevision),
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ expectedRevision: t.Integer({ minimum: 0 }) }),
      response: { 200: t.Unknown() }
    }
  );
