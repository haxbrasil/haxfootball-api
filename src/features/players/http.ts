import { Elysia, t } from "elysia";
import {
  associatePlayerAccount,
  associatePlayerAccountBodySchema
} from "@/features/players/associate-player-account";
import {
  createPlayer,
  createPlayerBodySchema
} from "@/features/players/create-player";
import { getPlayer } from "@/features/players/get-player";
import {
  listPlayerMatches,
  listPlayerMatchesResponseSchema
} from "@/features/matches/list-player-matches";
import {
  listPlayers,
  listPlayersResponseSchema
} from "@/features/players/list-players";
import {
  playerCountrySchema,
  playerIdParamsSchema
} from "@/features/players/_shared/http/inputs";
import {
  playerAccountResponseSchema,
  playerResponseSchema
} from "@/features/players/_shared/http/responses";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

const listPlayersQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  search: t.Optional(t.String({ minLength: 1, maxLength: 25 })),
  accountUuid: t.Optional(t.String({ format: "uuid" })),
  country: t.Optional(playerCountrySchema)
});

export {
  playerIdParamsSchema,
  playerNameSchema
} from "@/features/players/_shared/http/inputs";
export {
  playerAccountResponseSchema,
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/_shared/http/responses";
export type { PlayerResponse } from "@/features/players/_shared/http/responses";

export const playerRoutes = new Elysia({
  name: "player-routes",
  prefix: "/players"
})
  .model({
    AssociatePlayerAccountBody: associatePlayerAccountBodySchema,
    CreatePlayerBody: createPlayerBodySchema,
    ListPlayerMatches: listPlayerMatchesResponseSchema,
    ListPlayers: listPlayersResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    PlayerAccount: playerAccountResponseSchema,
    Player: playerResponseSchema
  })
  .get("", ({ query }) => listPlayers(query), {
    query: listPlayersQuerySchema,
    response: {
      200: t.Ref("ListPlayers")
    },
    detail: {
      tags: ["Players"],
      summary: "List players"
    }
  })
  .get("/:externalId", ({ params }) => getPlayer(params.externalId), {
    params: playerIdParamsSchema,
    response: {
      200: t.Ref("Player"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Players"],
      summary: "Get a player"
    }
  })
  .get(
    "/:externalId/matches",
    ({ params, query }) => listPlayerMatches(params.externalId, query),
    {
      params: playerIdParamsSchema,
      query: paginationQuerySchema,
      response: {
        200: t.Ref("ListPlayerMatches"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Players"],
        summary: "List player matches"
      }
    }
  )
  .post(
    "",
    ({ body, set }) => {
      set.status = 201;

      return createPlayer(body);
    },
    {
      body: t.Ref("CreatePlayerBody"),
      response: {
        201: t.Ref("Player")
      },
      detail: {
        tags: ["Players"],
        summary: "Add a player"
      }
    }
  )
  .patch(
    "/:externalId/account",
    ({ body, params }) => associatePlayerAccount(params.externalId, body),
    {
      body: t.Ref("AssociatePlayerAccountBody"),
      params: playerIdParamsSchema,
      response: {
        200: t.Ref("Player"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Players"],
        summary: "Associate a player with an account"
      }
    }
  );
