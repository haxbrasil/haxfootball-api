import { Elysia, t } from "elysia";
import {
  addMatchEvent,
  addMatchEventBodySchema
} from "@/features/match-events/add-match-event";
import {
  disableMatchEvent,
  disableMatchEventBodySchema
} from "@/features/match-events/disable-match-event";
import {
  getMatchMetrics,
  matchMetricsResponseSchema
} from "@/features/match-events/get-match-metrics";
import {
  queryMatchMetrics,
  queryMatchMetricsBodySchema,
  queryMatchMetricsResponseSchema
} from "@/features/match-events/query-match-metrics";
import {
  listMatchEvents,
  listMatchEventsResponseSchema
} from "@/features/match-events/list-match-events";
import {
  matchEventIdParamsSchema,
  matchEventResponseSchema
} from "@/features/match-events/http";
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
  listMatchesQuerySchema,
  matchEventInputSchema,
  matchScoreSchema
} from "@/features/matches/_shared/http/inputs";
import {
  matchPlayerStintResponseSchema,
  matchResponseSchema,
  matchSummaryResponseSchema
} from "@/features/matches/_shared/http/responses";
import {
  playerAccountResponseSchema,
  playerResponseSchema
} from "@/features/players/http";
import { recordingResponseSchema } from "@/features/recordings/http";
import { eventSchemaReferenceSchema } from "@/features/event-schemas/http";
import {
  updateMatch,
  updateMatchBodySchema
} from "@/features/matches/update-match";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export const matchRoutes = new Elysia({
  name: "match-routes",
  prefix: "/matches"
})
  .model({
    BadRequestError: badRequestErrorResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    PlayerAccount: playerAccountResponseSchema,
    Player: playerResponseSchema,
    Recording: recordingResponseSchema,
    EventSchemaReference: eventSchemaReferenceSchema,
    MatchScore: matchScoreSchema,
    MatchEventInput: matchEventInputSchema,
    MatchEvent: matchEventResponseSchema,
    MatchStint: matchPlayerStintResponseSchema,
    MatchSummary: matchSummaryResponseSchema,
    AddMatchEventBody: addMatchEventBodySchema,
    AssociateMatchRecordingBody: associateMatchRecordingBodySchema,
    CreateMatchBody: createMatchBodySchema,
    DisableMatchEventBody: disableMatchEventBodySchema,
    ListMatches: listMatchesResponseSchema,
    ListMatchEvents: listMatchEventsResponseSchema,
    Match: matchResponseSchema,
    MatchMetrics: matchMetricsResponseSchema,
    QueryMatchMetricsBody: queryMatchMetricsBodySchema,
    QueryMatchMetrics: queryMatchMetricsResponseSchema,
    UpdateMatchBody: updateMatchBodySchema
  })
  .get("", ({ query }) => listMatches(query), {
    query: listMatchesQuerySchema,
    response: {
      200: t.Ref("ListMatches")
    },
    detail: {
      tags: ["Matches"],
      summary: "List matches"
    }
  })
  .post("/metrics/query", ({ body }) => queryMatchMetrics(body), {
    body: t.Ref("QueryMatchMetricsBody"),
    response: {
      200: t.Ref("QueryMatchMetrics"),
      400: t.Ref("BadRequestError"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Match Metrics"],
      summary: "Query match metrics"
    }
  })
  .get("/:id", ({ params }) => getMatch(params.id), {
    params: matchPublicIdParamsSchema,
    response: {
      200: t.Ref("Match"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Matches"],
      summary: "Get a match"
    }
  })
  .post(
    "",
    async ({ body, set }) => {
      const match = await createMatch(body);

      set.status = 201;

      return match;
    },
    {
      body: t.Ref("CreateMatchBody"),
      response: {
        201: t.Ref("Match"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Matches"],
        summary: "Create a match"
      }
    }
  )
  .patch("/:id", ({ body, params }) => updateMatch(params.id, body), {
    body: t.Ref("UpdateMatchBody"),
    params: matchPublicIdParamsSchema,
    response: {
      200: t.Ref("Match"),
      400: t.Ref("BadRequestError"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Matches"],
      summary: "Update a match"
    }
  })
  .get(
    "/:id/events",
    ({ params, query }) => listMatchEvents(params.id, query),
    {
      params: matchPublicIdParamsSchema,
      query: paginationQuerySchema,
      response: {
        200: t.Ref("ListMatchEvents"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Match Events"],
        summary: "List match events"
      }
    }
  )
  .post(
    "/:id/events",
    async ({ body, params, set }) => {
      const event = await addMatchEvent(params.id, body);

      set.status = 201;

      return event;
    },
    {
      body: t.Ref("AddMatchEventBody"),
      params: matchPublicIdParamsSchema,
      response: {
        201: t.Ref("MatchEvent"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Match Events"],
        summary: "Add match event"
      }
    }
  )
  .patch(
    "/:id/events/:eventId",
    ({ params }) => disableMatchEvent(params.id, params.eventId),
    {
      body: t.Ref("DisableMatchEventBody"),
      params: matchEventIdParamsSchema,
      response: {
        200: t.Ref("MatchEvent"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Match Events"],
        summary: "Disable match event"
      }
    }
  )
  .get("/:id/metrics", ({ params }) => getMatchMetrics(params.id), {
    params: matchPublicIdParamsSchema,
    response: {
      200: t.Ref("MatchMetrics"),
      400: t.Ref("BadRequestError"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Match Metrics"],
      summary: "Get match metrics"
    }
  })
  .patch(
    "/:id/recording",
    ({ body, params }) => associateMatchRecording(params.id, body),
    {
      body: t.Ref("AssociateMatchRecordingBody"),
      params: matchPublicIdParamsSchema,
      response: {
        200: t.Ref("Match"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Matches"],
        summary: "Associate a match recording"
      }
    }
  );
