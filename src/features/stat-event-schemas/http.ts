import { Elysia, t } from "elysia";
import {
  createStatEventSchema,
  createStatEventSchemaBodySchema
} from "@/features/stat-event-schemas/create-stat-event-schema";
import {
  getLatestStatEventSchema,
  getLatestStatEventSchemaByName,
  getStatEventSchemaVersionByName,
  getStatEventSchemaVersion
} from "@/features/stat-event-schemas/get-stat-event-schema";
import {
  listStatEventSchemas,
  listStatEventSchemasResponseSchema
} from "@/features/stat-event-schemas/list-stat-event-schemas";
import {
  publishStatEventSchemaVersion,
  publishStatEventSchemaVersionBodySchema
} from "@/features/stat-event-schemas/publish-stat-event-schema-version";
import {
  statEventSchemaIdParamsSchema,
  statEventSchemaNameParamsSchema,
  statEventSchemaNameVersionParamsSchema,
  statEventSchemaVersionParamsSchema
} from "@/features/stat-event-schemas/_shared/http/inputs";
import { statEventSchemaResponseSchema } from "@/features/stat-event-schemas/_shared/http/responses";
import {
  updateStatEventSchema,
  updateStatEventSchemaBodySchema
} from "@/features/stat-event-schemas/update-stat-event-schema";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export {
  statEventSchemaIdParamsSchema,
  statEventSchemaIdSchema,
  statEventSchemaNameParamsSchema,
  statEventSchemaNameSchema,
  statEventSchemaNameVersionParamsSchema,
  statEventSchemaReferenceSchema,
  statEventSchemaVersionParamsSchema
} from "@/features/stat-event-schemas/_shared/http/inputs";
export type { StatEventSchemaReference } from "@/features/stat-event-schemas/_shared/http/inputs";
export {
  listStatEventSchemasResponseSchema,
  statEventSchemaResponseSchema,
  toStatEventSchemaResponse
} from "@/features/stat-event-schemas/_shared/http/responses";
export type {
  StatEventSchemaResponse,
  StatEventSchemaRow
} from "@/features/stat-event-schemas/_shared/http/responses";

export const statEventSchemaRoutes = new Elysia({
  name: "stat-event-schema-routes",
  prefix: "/stat-event-schemas"
})
  .model({
    BadRequestError: badRequestErrorResponseSchema,
    CreateStatEventSchemaBody: createStatEventSchemaBodySchema,
    ListStatEventSchemas: listStatEventSchemasResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    PublishStatEventSchemaVersionBody: publishStatEventSchemaVersionBodySchema,
    StatEventSchema: statEventSchemaResponseSchema,
    UpdateStatEventSchemaBody: updateStatEventSchemaBodySchema
  })
  .get("", ({ query }) => listStatEventSchemas(query), {
    query: paginationQuerySchema,
    response: {
      200: t.Ref("ListStatEventSchemas")
    },
    detail: {
      tags: ["Stat Event Schemas"],
      summary: "List stat event schemas"
    }
  })
  .get(
    "/by-name/:name",
    ({ params }) => getLatestStatEventSchemaByName(params.name),
    {
      params: statEventSchemaNameParamsSchema,
      response: {
        200: t.Ref("StatEventSchema"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "Get latest stat event schema by name"
      }
    }
  )
  .get(
    "/by-name/:name/versions/:version",
    ({ params }) =>
      getStatEventSchemaVersionByName(params.name, params.version),
    {
      params: statEventSchemaNameVersionParamsSchema,
      response: {
        200: t.Ref("StatEventSchema"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "Get stat event schema version by name"
      }
    }
  )
  .get("/:id", ({ params }) => getLatestStatEventSchema(params.id), {
    params: statEventSchemaIdParamsSchema,
    response: {
      200: t.Ref("StatEventSchema"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Stat Event Schemas"],
      summary: "Get latest stat event schema"
    }
  })
  .get(
    "/:id/versions/:version",
    ({ params }) => getStatEventSchemaVersion(params.id, params.version),
    {
      params: statEventSchemaVersionParamsSchema,
      response: {
        200: t.Ref("StatEventSchema"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "Get stat event schema version"
      }
    }
  )
  .post(
    "",
    ({ body, set }) => {
      set.status = 201;

      return createStatEventSchema(body);
    },
    {
      body: t.Ref("CreateStatEventSchemaBody"),
      response: {
        201: t.Ref("StatEventSchema"),
        400: t.Ref("BadRequestError")
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "Create stat event schema"
      }
    }
  )
  .patch(
    "/:id/versions/:version",
    ({ body, params }) =>
      updateStatEventSchema(params.id, params.version, body),
    {
      body: t.Ref("UpdateStatEventSchemaBody"),
      params: statEventSchemaVersionParamsSchema,
      response: {
        200: t.Ref("StatEventSchema"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "Update stat event schema version"
      }
    }
  )
  .post(
    "/:id/versions",
    ({ body, params, set }) => {
      set.status = 201;

      return publishStatEventSchemaVersion(params.id, body);
    },
    {
      body: t.Ref("PublishStatEventSchemaVersionBody"),
      params: statEventSchemaIdParamsSchema,
      response: {
        201: t.Ref("StatEventSchema"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "Publish stat event schema version"
      }
    }
  );
