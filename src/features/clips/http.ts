import { Elysia, t } from "elysia";
import { archiveClip } from "@/features/clips/archive-clip";
import { createClip } from "@/features/clips/create-clip";
import { getClip } from "@/features/clips/get-clip";
import { getClipConfiguration } from "@/features/clips/_shared/domain/config";
import {
  listClips,
  listClipsResponseSchema
} from "@/features/clips/list-clips";
import {
  clipPublicIdParamsSchema,
  createClipBodySchema,
  listClipsQuerySchema,
  updateClipBodySchema
} from "@/features/clips/_shared/http/inputs";
import {
  clipConfigurationResponseSchema,
  clipResponseSchema
} from "@/features/clips/_shared/http/responses";
import { updateClip } from "@/features/clips/update-clip";
import { createClipExport } from "@/features/clips/create-export";
import { listClipExports } from "@/features/clips/list-exports";
import { env } from "@/config/env";
import {
  clipExportCapabilitiesResponseSchema,
  clipExportResponseSchema,
  listClipExportsResponseSchema
} from "@/features/clips/_shared/http/responses";
import {
  clipExportFormats,
  clipExportOrientations,
  clipExportScoreboards
} from "@/features/clips/_shared/domain/exports";
import { createClipExportBodySchema } from "@/features/clips/_shared/http/inputs";
import { listRenderProfiles } from "@/features/render-profiles/operations";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";

export { clipPublicIdParamsSchema } from "@/features/clips/_shared/http/inputs";
export {
  clipResponseSchema,
  clipConfigurationResponseSchema,
  listClipsResponseSchema,
  toClipResponse
} from "@/features/clips/_shared/http/responses";
export type {
  ClipConfigurationResponse,
  ClipResponse
} from "@/features/clips/_shared/http/responses";

export const clipRoutes = new Elysia({
  name: "clip-routes",
  prefix: "/clips"
})
  .model({
    BadRequestError: badRequestErrorResponseSchema,
    Clip: clipResponseSchema,
    ClipConfiguration: clipConfigurationResponseSchema,
    CreateClipBody: createClipBodySchema,
    ListClips: listClipsResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    UpdateClipBody: updateClipBodySchema,
    CreateClipExportBody: createClipExportBodySchema,
    ClipExport: clipExportResponseSchema,
    ListClipExports: listClipExportsResponseSchema,
    ClipExportCapabilities: clipExportCapabilitiesResponseSchema
  })
  .get("", ({ query }) => listClips(query), {
    query: listClipsQuerySchema,
    response: {
      200: t.Ref("ListClips")
    },
    detail: {
      tags: ["Clips"],
      summary: "List clips"
    }
  })
  .get("/config", () => getClipConfiguration(), {
    response: {
      200: t.Ref("ClipConfiguration")
    },
    detail: {
      tags: ["Clips"],
      summary: "Get clip configuration"
    }
  })
  .get("/:id", ({ params }) => getClip(params.id), {
    params: clipPublicIdParamsSchema,
    response: {
      200: t.Ref("Clip"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Clips"],
      summary: "Get a clip"
    }
  })
  .get(
    "/:id/exports/capabilities",
    async () => ({
      ttlSeconds: env.clipExportTtlSeconds,
      formats: [...clipExportFormats],
      orientations: [...clipExportOrientations],
      scoreboards: [...clipExportScoreboards],
      renderProfiles: (await listRenderProfiles())
        .filter(
          (profile) => profile.state === "active" && profile.latestVersion
        )
        .map((profile) => ({
          id: profile.latestVersion!.uuid,
          title: profile.title,
          description: profile.description,
          version: profile.latestVersion!.version,
          formats: profile.latestVersion!.settings.formats,
          orientations: profile.latestVersion!.settings.orientations,
          scoreboards: profile.latestVersion!.settings.scoreboards
        }))
    }),
    {
      params: clipPublicIdParamsSchema,
      response: { 200: t.Ref("ClipExportCapabilities") },
      detail: { tags: ["Clips"], summary: "Get clip export capabilities" }
    }
  )
  .get("/:id/exports", ({ params }) => listClipExports(params.id), {
    params: clipPublicIdParamsSchema,
    response: {
      200: t.Ref("ListClipExports"),
      404: t.Ref("NotFoundError")
    },
    detail: { tags: ["Clips"], summary: "List clip exports" }
  })
  .post(
    "/:id/exports",
    ({ params, body, set }) => {
      set.status = 202;
      return createClipExport(params.id, body);
    },
    {
      params: clipPublicIdParamsSchema,
      body: t.Ref("CreateClipExportBody"),
      response: {
        202: t.Ref("ClipExport"),
        404: t.Ref("NotFoundError")
      },
      detail: { tags: ["Clips"], summary: "Request a clip export" }
    }
  )
  .post(
    "",
    async ({ body, set }) => {
      const clip = await createClip(body);
      set.status = 201;
      return clip;
    },
    {
      body: t.Ref("CreateClipBody"),
      response: {
        201: t.Ref("Clip"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Clips"],
        summary: "Create a clip"
      }
    }
  )
  .patch("/:id", ({ body, params }) => updateClip(params.id, body), {
    params: clipPublicIdParamsSchema,
    body: t.Ref("UpdateClipBody"),
    response: {
      200: t.Ref("Clip"),
      400: t.Ref("BadRequestError"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Clips"],
      summary: "Update a clip"
    }
  })
  .delete(
    "/:id",
    async ({ params, set }) => {
      await archiveClip(params.id);
      set.status = 204;
    },
    {
      params: clipPublicIdParamsSchema,
      response: {
        204: t.Void(),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Clips"],
        summary: "Archive a clip"
      }
    }
  );
