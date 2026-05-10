import { Elysia } from "elysia";
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
  playerResponseSchema
} from "@/features/players/player.contract";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";

export const playerRoutes = new Elysia({
  name: "player-routes",
  prefix: "/players"
})
  .get(
    "",
    () => listPlayers(),
    {
      response: {
        200: listPlayersResponseSchema
      },
      detail: {
        tags: ["Players"],
        summary: "List players"
      }
    }
  )
  .get(
    "/:id",
    ({ params }) => getPlayer(params.id),
    {
      params: playerIdParamsSchema,
      response: {
        200: playerResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Players"],
        summary: "Get a player"
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
      body: createPlayerBodySchema,
      response: {
        201: playerResponseSchema
      },
      detail: {
        tags: ["Players"],
        summary: "Add a player"
      }
    }
  )
  .patch(
    "/:id/account",
    ({ body, params }) => associatePlayerAccount(params.id, body),
    {
      body: associatePlayerAccountBodySchema,
      params: playerIdParamsSchema,
      response: {
        200: playerResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Players"],
        summary: "Associate a player with an account"
      }
    }
  );
