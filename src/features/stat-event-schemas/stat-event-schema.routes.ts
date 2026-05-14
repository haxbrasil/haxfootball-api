import { Elysia, t } from "elysia";
import {
  createStatEventSchema,
  createStatEventSchemaBodySchema
} from "@/features/stat-event-schemas/create-stat-event-schema";
import {
  getLatestStatEventSchema,
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
  statEventSchemaResponseSchema,
  statEventSchemaVersionParamsSchema
} from "@/features/stat-event-schemas/stat-event-schema.contract";
import {
  updateStatEventSchema,
  updateStatEventSchemaBodySchema
} from "@/features/stat-event-schemas/update-stat-event-schema";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

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
