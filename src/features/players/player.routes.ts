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
  listPlayers,
  listPlayersResponseSchema
} from "@/features/players/list-players";
import {
  playerIdParamsSchema,
  playerAccountResponseSchema,
  playerResponseSchema
} from "@/features/players/player.contract";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export const playerRoutes = new Elysia({
  name: "player-routes",
  prefix: "/players"
})
  .model({
    AssociatePlayerAccountBody: associatePlayerAccountBodySchema,
    CreatePlayerBody: createPlayerBodySchema,
    ListPlayers: listPlayersResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    PlayerAccount: playerAccountResponseSchema,
    Player: playerResponseSchema
  })
  .get("", ({ query }) => listPlayers(query), {
    query: paginationQuerySchema,
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
