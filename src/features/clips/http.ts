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
    UpdateClipBody: updateClipBodySchema
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
