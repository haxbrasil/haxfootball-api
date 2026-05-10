import { Elysia } from "elysia";
import {
  createStatEventSchema,
  createStatEventSchemaBodySchema,
  createStatEventSchemaResponseSchema
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
  publishStatEventSchemaVersionBodySchema,
  publishStatEventSchemaVersionResponseSchema
} from "@/features/stat-event-schemas/publish-stat-event-schema-version";
import {
  statEventSchemaIdParamsSchema,
  statEventSchemaResponseSchema,
  statEventSchemaVersionParamsSchema
} from "@/features/stat-event-schemas/stat-event-schema.contract";
import {
  updateStatEventSchema,
  updateStatEventSchemaBodySchema,
  updateStatEventSchemaResponseSchema
} from "@/features/stat-event-schemas/update-stat-event-schema";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";

export const statEventSchemaRoutes = new Elysia({
  name: "stat-event-schema-routes",
  prefix: "/stat-event-schemas"
})
  .get(
    "",
    () => listStatEventSchemas(),
    {
      response: {
        200: listStatEventSchemasResponseSchema
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "List stat event schemas"
      }
    }
  )
  .get(
    "/:id",
    ({ params }) => getLatestStatEventSchema(params.id),
    {
      params: statEventSchemaIdParamsSchema,
      response: {
        200: statEventSchemaResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "Get latest stat event schema"
      }
    }
  )
  .get(
    "/:id/versions/:version",
    ({ params }) => getStatEventSchemaVersion(params.id, params.version),
    {
      params: statEventSchemaVersionParamsSchema,
      response: {
        200: statEventSchemaResponseSchema,
        404: notFoundErrorResponseSchema
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
      body: createStatEventSchemaBodySchema,
      response: {
        201: createStatEventSchemaResponseSchema,
        400: badRequestErrorResponseSchema
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "Create stat event schema"
      }
    }
  )
  .patch(
    "/:id/versions/:version",
    ({ body, params }) => updateStatEventSchema(params.id, params.version, body),
    {
      body: updateStatEventSchemaBodySchema,
      params: statEventSchemaVersionParamsSchema,
      response: {
        200: updateStatEventSchemaResponseSchema,
        400: badRequestErrorResponseSchema,
        404: notFoundErrorResponseSchema
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
      body: publishStatEventSchemaVersionBodySchema,
      params: statEventSchemaIdParamsSchema,
      response: {
        201: publishStatEventSchemaVersionResponseSchema,
        400: badRequestErrorResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Stat Event Schemas"],
        summary: "Publish stat event schema version"
      }
    }
  );
