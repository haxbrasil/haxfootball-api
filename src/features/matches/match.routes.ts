import { Elysia, t } from "elysia";
import {
  addMatchStatEvent,
  addMatchStatEventBodySchema
} from "@/features/match-stat-events/add-match-stat-event";
import {
  disableMatchStatEvent,
  disableMatchStatEventBodySchema
} from "@/features/match-stat-events/disable-match-stat-event";
import {
  getMatchMetrics,
  matchMetricsResponseSchema
} from "@/features/match-stat-events/get-match-metrics";
import {
  listMatchStatEvents,
  listMatchStatEventsResponseSchema
} from "@/features/match-stat-events/list-match-stat-events";
import {
  matchStatEventIdParamsSchema,
  matchStatEventResponseSchema
} from "@/features/match-stat-events/match-stat-event.contract";
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
  matchPlayerEventInputSchema,
  matchPlayerEventResponseSchema,
  matchPlayerStintResponseSchema,
  matchResponseSchema,
  matchScoreSchema,
  matchSummaryResponseSchema
} from "@/features/matches/match.contract";
import {
  playerAccountResponseSchema,
  playerResponseSchema
} from "@/features/players/player.contract";
import { recordingResponseSchema } from "@/features/recordings/recording.contract";
import { statEventSchemaReferenceSchema } from "@/features/stat-event-schemas/stat-event-schema.contract";
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
    StatEventSchemaReference: statEventSchemaReferenceSchema,
    MatchScore: matchScoreSchema,
    MatchEventInput: matchPlayerEventInputSchema,
    MatchEvent: matchPlayerEventResponseSchema,
    MatchStint: matchPlayerStintResponseSchema,
    MatchSummary: matchSummaryResponseSchema,
    AddMatchStatEventBody: addMatchStatEventBodySchema,
    AppendMatchEventsBody: appendMatchEventsBodySchema,
    AssociateMatchRecordingBody: associateMatchRecordingBodySchema,
    CreateMatchBody: createMatchBodySchema,
    DisableMatchStatEventBody: disableMatchStatEventBodySchema,
    ListMatches: listMatchesResponseSchema,
    ListMatchStatEvents: listMatchStatEventsResponseSchema,
    Match: matchResponseSchema,
    MatchMetrics: matchMetricsResponseSchema,
    MatchStatEvent: matchStatEventResponseSchema,
    UpdateMatchBody: updateMatchBodySchema
  })
  .get("", ({ query }) => listMatches(query), {
    query: paginationQuerySchema,
    response: {
      200: t.Ref("ListMatches")
    },
    detail: {
      tags: ["Matches"],
      summary: "List matches"
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
  .post(
    "/:id/events",
    ({ body, params }) => appendMatchEvents(params.id, body),
    {
      body: t.Ref("AppendMatchEventsBody"),
      params: matchPublicIdParamsSchema,
      response: {
        200: t.Ref("Match"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Matches"],
        summary: "Append match player events"
      }
    }
  )
  .get(
    "/:id/stat-events",
    ({ params, query }) => listMatchStatEvents(params.id, query),
    {
      params: matchPublicIdParamsSchema,
      query: paginationQuerySchema,
      response: {
        200: t.Ref("ListMatchStatEvents"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Match Stat Events"],
        summary: "List match stat events"
      }
    }
  )
  .post(
    "/:id/stat-events",
    async ({ body, params, set }) => {
      const event = await addMatchStatEvent(params.id, body);

      set.status = 201;

      return event;
    },
    {
      body: t.Ref("AddMatchStatEventBody"),
      params: matchPublicIdParamsSchema,
      response: {
        201: t.Ref("MatchStatEvent"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Match Stat Events"],
        summary: "Add match stat event"
      }
    }
  )
  .patch(
    "/:id/stat-events/:eventId",
    ({ params }) => disableMatchStatEvent(params.id, params.eventId),
    {
      body: t.Ref("DisableMatchStatEventBody"),
      params: matchStatEventIdParamsSchema,
      response: {
        200: t.Ref("MatchStatEvent"),
        400: t.Ref("BadRequestError"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Match Stat Events"],
        summary: "Disable match stat event"
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
