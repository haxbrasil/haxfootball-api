import { Elysia } from "elysia";
import {
  closeRoom,
  closeRoomResponseSchema
} from "@/features/rooms/close-room";
import { createRoom, createRoomBodySchema } from "@/features/rooms/create-room";
import {
  createRoomProgram,
  createRoomProgramBodySchema
} from "@/features/rooms/create-room-program";
import {
  createRoomProgramVersion,
  createRoomProgramVersionBodySchema
} from "@/features/rooms/create-room-program-version";
import {
  createRoomProxyEndpoint,
  createRoomProxyEndpointBodySchema
} from "@/features/rooms/create-room-proxy-endpoint";
import {
  discoverRoomProgramVersions,
  discoverRoomProgramVersionsBodySchema,
  discoverRoomProgramVersionsResponseSchema
} from "@/features/rooms/discover-room-program-versions";
import { getRoom, roomResponseSchema } from "@/features/rooms/get-room";
import {
  getRoomProgram,
  roomProgramResponseSchema
} from "@/features/rooms/get-room-program";
import {
  listRooms,
  listRoomsResponseSchema
} from "@/features/rooms/list-rooms";
import {
  listRoomPrograms,
  listRoomProgramsResponseSchema
} from "@/features/rooms/list-room-programs";
import {
  listRoomProgramVersions,
  listRoomProgramVersionsResponseSchema
} from "@/features/rooms/list-room-program-versions";
import {
  listRoomProxyEndpoints,
  listRoomProxyEndpointsResponseSchema
} from "@/features/rooms/list-room-proxy-endpoints";
import {
  reportRoomReady,
  reportRoomReadyBodySchema,
  reportRoomReadyResponseSchema
} from "@/features/rooms/report-room-ready";
import {
  listRoomsQuerySchema,
  roomIdParamsSchema,
  roomProgramIdParamsSchema,
  roomProgramVersionResponseSchema,
  roomProxyEndpointIdParamsSchema,
  roomProxyEndpointResponseSchema
} from "@/features/rooms/room.contract";
import {
  updateRoomProgram,
  updateRoomProgramBodySchema
} from "@/features/rooms/update-room-program";
import {
  updateRoomProxyEndpoint,
  updateRoomProxyEndpointBodySchema
} from "@/features/rooms/update-room-proxy-endpoint";
import { jwtPlugin } from "@/plugins/jwt";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";

export const roomRoutes = new Elysia({
  name: "room-routes"
})
  .use(jwtPlugin())
  .group("/room-programs", (app) =>
    app
      .get("", () => listRoomPrograms(), {
        response: {
          200: listRoomProgramsResponseSchema
        },
        detail: {
          tags: ["Rooms"],
          summary: "List room programs"
        }
      })
      .get("/:id", ({ params }) => getRoomProgram(params.id), {
        params: roomProgramIdParamsSchema,
        response: {
          200: roomProgramResponseSchema,
          404: notFoundErrorResponseSchema
        },
        detail: {
          tags: ["Rooms"],
          summary: "Get room program"
        }
      })
      .post(
        "",
        ({ body, set }) => {
          set.status = 201;

          return createRoomProgram(body);
        },
        {
          body: createRoomProgramBodySchema,
          response: {
            201: roomProgramResponseSchema,
            400: badRequestErrorResponseSchema
          },
          detail: {
            tags: ["Rooms"],
            summary: "Create room program"
          }
        }
      )
      .patch("/:id", ({ body, params }) => updateRoomProgram(params.id, body), {
        body: updateRoomProgramBodySchema,
        params: roomProgramIdParamsSchema,
        response: {
          200: roomProgramResponseSchema,
          400: badRequestErrorResponseSchema,
          404: notFoundErrorResponseSchema
        },
        detail: {
          tags: ["Rooms"],
          summary: "Update room program"
        }
      })
      .get(
        "/:id/versions",
        ({ params }) => listRoomProgramVersions(params.id),
        {
          params: roomProgramIdParamsSchema,
          response: {
            200: listRoomProgramVersionsResponseSchema,
            404: notFoundErrorResponseSchema
          },
          detail: {
            tags: ["Rooms"],
            summary: "List room program versions"
          }
        }
      )
      .post(
        "/:id/versions",
        ({ body, params, set }) => {
          set.status = 201;

          return createRoomProgramVersion(params.id, body);
        },
        {
          body: createRoomProgramVersionBodySchema,
          params: roomProgramIdParamsSchema,
          response: {
            201: roomProgramVersionResponseSchema,
            400: badRequestErrorResponseSchema,
            404: notFoundErrorResponseSchema
          },
          detail: {
            tags: ["Rooms"],
            summary: "Create room program version"
          }
        }
      )
      .post(
        "/:id/versions/discover",
        ({ body, params, set }) => {
          set.status = 201;

          return discoverRoomProgramVersions(params.id, body);
        },
        {
          body: discoverRoomProgramVersionsBodySchema,
          params: roomProgramIdParamsSchema,
          response: {
            201: discoverRoomProgramVersionsResponseSchema,
            404: notFoundErrorResponseSchema
          },
          detail: {
            tags: ["Rooms"],
            summary: "Discover room program versions from GitHub Releases"
          }
        }
      )
  )
  .group("/room-proxy-endpoints", (app) =>
    app
      .get("", () => listRoomProxyEndpoints(), {
        response: {
          200: listRoomProxyEndpointsResponseSchema
        },
        detail: {
          tags: ["Rooms"],
          summary: "List room proxy endpoints"
        }
      })
      .post(
        "",
        ({ body, set }) => {
          set.status = 201;

          return createRoomProxyEndpoint(body);
        },
        {
          body: createRoomProxyEndpointBodySchema,
          response: {
            201: roomProxyEndpointResponseSchema,
            400: badRequestErrorResponseSchema
          },
          detail: {
            tags: ["Rooms"],
            summary: "Create room proxy endpoint"
          }
        }
      )
      .patch(
        "/:id",
        ({ body, params }) => updateRoomProxyEndpoint(params.id, body),
        {
          body: updateRoomProxyEndpointBodySchema,
          params: roomProxyEndpointIdParamsSchema,
          response: {
            200: roomProxyEndpointResponseSchema,
            404: notFoundErrorResponseSchema
          },
          detail: {
            tags: ["Rooms"],
            summary: "Update room proxy endpoint"
          }
        }
      )
  )
  .group("/rooms", (app) =>
    app
      .get("", ({ query }) => listRooms(query), {
        query: listRoomsQuerySchema,
        response: {
          200: listRoomsResponseSchema
        },
        detail: {
          tags: ["Rooms"],
          summary: "List room instances"
        }
      })
      .get("/:id", ({ params }) => getRoom(params.id), {
        params: roomIdParamsSchema,
        response: {
          200: roomResponseSchema,
          404: notFoundErrorResponseSchema
        },
        detail: {
          tags: ["Rooms"],
          summary: "Get room instance"
        }
      })
      .post(
        "",
        async ({ body, jwt, set }) => {
          set.status = 201;

          return createRoom(body, () =>
            jwt.sign({
              sub: "app",
              kind: "api",
              iat: true
            })
          );
        },
        {
          body: createRoomBodySchema,
          response: {
            201: roomResponseSchema,
            400: badRequestErrorResponseSchema,
            404: notFoundErrorResponseSchema
          },
          detail: {
            tags: ["Rooms"],
            summary: "Launch room instance"
          }
        }
      )
      .post("/:id/close", ({ params }) => closeRoom(params.id), {
        params: roomIdParamsSchema,
        response: {
          200: closeRoomResponseSchema,
          404: notFoundErrorResponseSchema
        },
        detail: {
          tags: ["Rooms"],
          summary: "Close room instance"
        }
      })
      .post(
        "/:id/ready",
        ({ body, params }) => reportRoomReady(params.id, body),
        {
          body: reportRoomReadyBodySchema,
          params: roomIdParamsSchema,
          response: {
            200: reportRoomReadyResponseSchema,
            400: badRequestErrorResponseSchema,
            404: notFoundErrorResponseSchema
          },
          detail: {
            tags: ["Rooms"],
            summary: "Report room ready for manual linking"
          }
        }
      )
  );
