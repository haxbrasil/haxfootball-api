import { Elysia, t } from "elysia";
import {
  createEventSchema,
  createEventSchemaBodySchema
} from "@/features/event-schemas/create-event-schema";
import {
  getLatestEventSchema,
  getLatestEventSchemaByName,
  getEventSchemaVersionByName,
  getEventSchemaVersion
} from "@/features/event-schemas/get-event-schema";
import {
  listEventSchemas,
  listEventSchemasResponseSchema
} from "@/features/event-schemas/list-event-schemas";
import {
  publishEventSchemaVersion,
  publishEventSchemaVersionBodySchema
} from "@/features/event-schemas/publish-event-schema-version";
import {
  eventSchemaIdParamsSchema,
  eventSchemaNameParamsSchema,
  eventSchemaNameVersionParamsSchema,
  eventSchemaVersionParamsSchema
} from "@/features/event-schemas/_shared/http/inputs";
import { eventSchemaResponseSchema } from "@/features/event-schemas/_shared/http/responses";
import {
  updateEventSchema,
  updateEventSchemaBodySchema
} from "@/features/event-schemas/update-event-schema";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export {
  eventSchemaIdParamsSchema,
  eventSchemaIdSchema,
  eventSchemaNameParamsSchema,
  eventSchemaNameSchema,
  eventSchemaNameVersionParamsSchema,
  eventSchemaReferenceSchema,
  eventSchemaVersionParamsSchema
} from "@/features/event-schemas/_shared/http/inputs";
export type { EventSchemaReference } from "@/features/event-schemas/_shared/http/inputs";
export {
  listEventSchemasResponseSchema,
  eventSchemaResponseSchema,
  toEventSchemaResponse
} from "@/features/event-schemas/_shared/http/responses";
export type {
  EventSchemaResponse,
  EventSchemaRow
} from "@/features/event-schemas/_shared/http/responses";

export const eventSchemaRoutes = new Elysia({
  name: "event-schema-routes",
  prefix: "/event-schemas"
})
  .model({
    BadRequestError: badRequestErrorResponseSchema,
    CreateEventSchemaBody: createEventSchemaBodySchema,
    ListEventSchemas: listEventSchemasResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    PublishEventSchemaVersionBody: publishEventSchemaVersionBodySchema,
    EventSchema: eventSchemaResponseSchema,
    UpdateEventSchemaBody: updateEventSchemaBodySchema
  })
  .get("", ({ query }) => listEventSchemas(query), {
    query: paginationQuerySchema,
    response: {
      200: t.Ref("ListEventSchemas")
    },
    detail: {
      tags: ["Event Schemas"],
      summary: "List event schemas"
    }
  })
  .get(
    "/by-name/:name",
    ({ params }) => getLatestEventSchemaByName(params.name),
    {
      params: eventSchemaNameParamsSchema,
      response: {
        200: t.Ref("EventSchema"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Event Schemas"],
        summary: "Get latest event schema by name"
      }
    }
  )
  .get(
    "/by-name/:name/versions/:version",
    ({ params }) => getEventSchemaVersionByName(params.name, params.version),
    {
      params: eventSchemaNameVersionParamsSchema,
      response: {
        200: t.Ref("EventSchema"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Event Schemas"],
        summary: "Get event schema version by name"
      }
    }
  )
  .get("/:id", ({ params }) => getLatestEventSchema(params.id), {
    params: eventSchemaIdParamsSchema,
    response: {
      200: t.Ref("EventSchema"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Event Schemas"],
      summary: "Get latest event schema"
    }
  })
  .get(
    "/:id/versions/:version",
    ({ params }) => getEventSchemaVersion(params.id, params.version),
    {
      params: eventSchemaVersionParamsSchema,
      response: {
        200: t.Ref("EventSchema"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Event Schemas"],
        summary: "Get event schema version"
      }
    }
  )
  .post(
    "",
    ({ body, set }) => {
      set.status = 201;

      return createEventSchema(body);
    },
    {
      body: t.Ref("CreateEventSchemaBody"),
      response: {
        201: t.Ref("EventSchema"),
        400: t.Ref("BadRequestError")
      },
      detail: {
        tags: ["Event Schemas"],
        summary: "Create event schema"
      }
    }
  )
  .patch(
    "/:id/versions/:version",
    ({ body, params }) => updateEventSchema(params.id, params.version, body),
    {
      body: t.Ref("UpdateEventSchemaBody"),
      params: eventSchemaVersionParamsSchema,
      response: {
        200: t.Ref("EventSchema"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Event Schemas"],
        summary: "Update event schema version"
      }
    }
  )
  .post(
    "/:id/versions",
    ({ body, params, set }) => {
      set.status = 201;

      return publishEventSchemaVersion(params.id, body);
    },
    {
      body: t.Ref("PublishEventSchemaVersionBody"),
      params: eventSchemaIdParamsSchema,
      response: {
        201: t.Ref("EventSchema"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Event Schemas"],
        summary: "Publish event schema version"
      }
    }
  );
