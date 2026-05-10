import { Elysia } from "elysia";
import {
  appendMatchEvents,
  appendMatchEventsBodySchema
} from "@/features/matches/append-match-events";
import {
  associateMatchRecording,
  associateMatchRecordingBodySchema
} from "@/features/matches/associate-match-recording";
import {
  createMatch,
  createMatchBodySchema
} from "@/features/matches/create-match";
import { getMatch } from "@/features/matches/get-match";
import {
  listMatches,
  listMatchesResponseSchema
} from "@/features/matches/list-matches";
import {
  matchPublicIdParamsSchema,
  matchResponseSchema
} from "@/features/matches/match.contract";
import {
  updateMatch,
  updateMatchBodySchema
} from "@/features/matches/update-match";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";

export const matchRoutes = new Elysia({
  name: "match-routes",
  prefix: "/matches"
})
  .get(
    "",
    () => listMatches(),
    {
      response: {
        200: listMatchesResponseSchema
      },
      detail: {
        tags: ["Matches"],
        summary: "List matches"
      }
    }
  )
  .get(
    "/:id",
    ({ params }) => getMatch(params.id),
    {
      params: matchPublicIdParamsSchema,
      response: {
        200: matchResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Matches"],
        summary: "Get a match"
      }
    }
  )
  .post(
    "",
    async ({ body, set }) => {
      const match = await createMatch(body);

      set.status = 201;

      return match;
    },
    {
      body: createMatchBodySchema,
      response: {
        201: matchResponseSchema,
        400: badRequestErrorResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Matches"],
        summary: "Create a match"
      }
    }
  )
  .patch(
    "/:id",
    ({ body, params }) => updateMatch(params.id, body),
    {
      body: updateMatchBodySchema,
      params: matchPublicIdParamsSchema,
      response: {
        200: matchResponseSchema,
        400: badRequestErrorResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Matches"],
        summary: "Update a match"
      }
    }
  )
  .post(
    "/:id/events",
    ({ body, params }) => appendMatchEvents(params.id, body),
    {
      body: appendMatchEventsBodySchema,
      params: matchPublicIdParamsSchema,
      response: {
        200: matchResponseSchema,
        400: badRequestErrorResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Matches"],
        summary: "Append match player events"
      }
    }
  )
  .patch(
    "/:id/recording",
    ({ body, params }) => associateMatchRecording(params.id, body),
    {
      body: associateMatchRecordingBodySchema,
      params: matchPublicIdParamsSchema,
      response: {
        200: matchResponseSchema,
        400: badRequestErrorResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Matches"],
        summary: "Associate a match recording"
      }
    }
  );
