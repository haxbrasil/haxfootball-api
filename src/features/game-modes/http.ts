import { Elysia, t } from "elysia";
import {
  createGameMode,
  createGameModeBodySchema
} from "@/features/game-modes/create-game-mode";
import { getGameMode } from "@/features/game-modes/get-game-mode";
import { getGameModeByName } from "@/features/game-modes/get-game-mode-by-name";
import {
  listGameModes,
  listGameModesQuerySchema,
  listGameModesResponseSchema
} from "@/features/game-modes/list-game-modes";
import {
  gameModeNameParamsSchema,
  gameModeLanguageQuerySchema,
  gameModeReferenceSchema,
  gameModeUuidParamsSchema
} from "@/features/game-modes/_shared/http/inputs";
import { gameModeResponseSchema } from "@/features/game-modes/_shared/http/responses";
import {
  updateGameMode,
  updateGameModeBodySchema
} from "@/features/game-modes/update-game-mode";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";

export {
  gameModeNameSchema,
  gameModeReferenceSchema,
  gameModeUuidSchema,
  gameModeVisibilitySchema
} from "@/features/game-modes/_shared/http/inputs";
export type { GameModeReference } from "@/features/game-modes/_shared/http/inputs";
export {
  gameModeResponseSchema,
  toGameModeResponse
} from "@/features/game-modes/_shared/http/responses";
export type { GameModeResponse } from "@/features/game-modes/_shared/http/responses";

export const gameModeRoutes = new Elysia({
  name: "game-mode-routes",
  prefix: "/game-modes"
})
  .model({
    BadRequestError: badRequestErrorResponseSchema,
    CreateGameModeBody: createGameModeBodySchema,
    GameMode: gameModeResponseSchema,
    GameModeReference: gameModeReferenceSchema,
    ListGameModes: listGameModesResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    UpdateGameModeBody: updateGameModeBodySchema
  })
  .get("", ({ query }) => listGameModes(query), {
    query: listGameModesQuerySchema,
    response: {
      200: t.Ref("ListGameModes")
    },
    detail: {
      tags: ["Game Modes"],
      summary: "List game modes"
    }
  })
  .get(
    "/by-name/:name",
    ({ params, query }) => getGameModeByName(params.name, query),
    {
      params: gameModeNameParamsSchema,
      query: gameModeLanguageQuerySchema,
      response: {
        200: t.Ref("GameMode"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Game Modes"],
        summary: "Get a game mode by name"
      }
    }
  )
  .get("/:id", ({ params, query }) => getGameMode(params.id, query), {
    params: gameModeUuidParamsSchema,
    query: gameModeLanguageQuerySchema,
    response: {
      200: t.Ref("GameMode"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Game Modes"],
      summary: "Get a game mode"
    }
  })
  .post(
    "",
    ({ body, set }) => {
      set.status = 201;

      return createGameMode(body);
    },
    {
      body: t.Ref("CreateGameModeBody"),
      response: {
        201: t.Ref("GameMode"),
        400: t.Ref("BadRequestError")
      },
      detail: {
        tags: ["Game Modes"],
        summary: "Create a game mode"
      }
    }
  )
  .patch("/:id", ({ body, params }) => updateGameMode(params.id, body), {
    body: t.Ref("UpdateGameModeBody"),
    params: gameModeUuidParamsSchema,
    response: {
      200: t.Ref("GameMode"),
      400: t.Ref("BadRequestError"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Game Modes"],
      summary: "Update a game mode"
    }
  });
