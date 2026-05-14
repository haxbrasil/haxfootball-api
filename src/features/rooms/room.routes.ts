import { Elysia, t } from "elysia";
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
  reportRoomReadyBodySchema
} from "@/features/rooms/report-room-ready";
import {
  listRoomsQuerySchema,
  roomLaunchConfigFieldSchema,
  roomIdParamsSchema,
  roomProgramIdParamsSchema,
  roomProgramReleaseSourceSchema,
  roomProgramVersionArtifactSchema,
  roomProgramVersionResponseSchema,
  roomProxyEndpointIdParamsSchema,
  roomProxyEndpointResponseSchema,
  roomResponseProgramSummarySchema,
  roomResponseProxyEndpointSummarySchema,
  roomResponseVersionSummarySchema
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
import { paginationQuerySchema } from "@lib";

export const roomRoutes = new Elysia({
  name: "room-routes"
})
  .use(jwtPlugin())
  .model({
    BadRequestError: badRequestErrorResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    RoomLaunchConfigField: roomLaunchConfigFieldSchema,
    RoomProgramReleaseSource: roomProgramReleaseSourceSchema,
    RoomProgramVersionArtifact: roomProgramVersionArtifactSchema,
    RoomResponseProgramSummary: roomResponseProgramSummarySchema,
    RoomResponseProxyEndpointSummary: roomResponseProxyEndpointSummarySchema,
    RoomResponseVersionSummary: roomResponseVersionSummarySchema,
    CloseRoomResponse: closeRoomResponseSchema,
    CreateRoomBody: createRoomBodySchema,
    CreateRoomProgramBody: createRoomProgramBodySchema,
    CreateRoomProgramVersionBody: createRoomProgramVersionBodySchema,
    CreateRoomProxyEndpointBody: createRoomProxyEndpointBodySchema,
    DiscoverRoomProgramVersionsBody: discoverRoomProgramVersionsBodySchema,
    DiscoverRoomProgramVersionsResponse:
      discoverRoomProgramVersionsResponseSchema,
    ListRoomProgramVersions: listRoomProgramVersionsResponseSchema,
    ListRoomPrograms: listRoomProgramsResponseSchema,
    ListRoomProxyEndpoints: listRoomProxyEndpointsResponseSchema,
    ListRooms: listRoomsResponseSchema,
    ReportRoomReadyBody: reportRoomReadyBodySchema,
    Room: roomResponseSchema,
    RoomProgram: roomProgramResponseSchema,
    RoomProgramVersion: roomProgramVersionResponseSchema,
    RoomProxyEndpoint: roomProxyEndpointResponseSchema,
    UpdateRoomProgramBody: updateRoomProgramBodySchema,
    UpdateRoomProxyEndpointBody: updateRoomProxyEndpointBodySchema
  })
  .group("/room-programs", (app) =>
    app
      .get("", ({ query }) => listRoomPrograms(query), {
        query: paginationQuerySchema,
        response: {
          200: t.Ref("ListRoomPrograms")
        },
        detail: {
          tags: ["Rooms"],
          summary: "List room programs"
        }
      })
      .get("/:id", ({ params }) => getRoomProgram(params.id), {
        params: roomProgramIdParamsSchema,
        response: {
          200: t.Ref("RoomProgram"),
          404: t.Ref("NotFoundError")
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
          body: t.Ref("CreateRoomProgramBody"),
          response: {
            201: t.Ref("RoomProgram"),
            400: t.Ref("BadRequestError")
          },
          detail: {
            tags: ["Rooms"],
            summary: "Create room program"
          }
        }
      )
      .patch("/:id", ({ body, params }) => updateRoomProgram(params.id, body), {
        body: t.Ref("UpdateRoomProgramBody"),
        params: roomProgramIdParamsSchema,
        response: {
          200: t.Ref("RoomProgram"),
          400: t.Ref("BadRequestError"),
          404: t.Ref("NotFoundError")
        },
        detail: {
          tags: ["Rooms"],
          summary: "Update room program"
        }
      })
      .get(
        "/:id/versions",
        ({ params, query }) => listRoomProgramVersions(params.id, query),
        {
          params: roomProgramIdParamsSchema,
          query: paginationQuerySchema,
          response: {
            200: t.Ref("ListRoomProgramVersions"),
            404: t.Ref("NotFoundError")
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
          body: t.Ref("CreateRoomProgramVersionBody"),
          params: roomProgramIdParamsSchema,
          response: {
            201: t.Ref("RoomProgramVersion"),
            400: t.Ref("BadRequestError"),
            404: t.Ref("NotFoundError")
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
          body: t.Ref("DiscoverRoomProgramVersionsBody"),
          params: roomProgramIdParamsSchema,
          response: {
            201: t.Ref("DiscoverRoomProgramVersionsResponse"),
            404: t.Ref("NotFoundError")
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
      .get("", ({ query }) => listRoomProxyEndpoints(query), {
        query: paginationQuerySchema,
        response: {
          200: t.Ref("ListRoomProxyEndpoints")
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
          body: t.Ref("CreateRoomProxyEndpointBody"),
          response: {
            201: t.Ref("RoomProxyEndpoint"),
            400: t.Ref("BadRequestError")
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
          body: t.Ref("UpdateRoomProxyEndpointBody"),
          params: roomProxyEndpointIdParamsSchema,
          response: {
            200: t.Ref("RoomProxyEndpoint"),
            404: t.Ref("NotFoundError")
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
          200: t.Ref("ListRooms")
        },
        detail: {
          tags: ["Rooms"],
          summary: "List room instances"
        }
      })
      .get("/:id", ({ params }) => getRoom(params.id), {
        params: roomIdParamsSchema,
        response: {
          200: t.Ref("Room"),
          404: t.Ref("NotFoundError")
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
          body: t.Ref("CreateRoomBody"),
          response: {
            201: t.Ref("Room"),
            400: t.Ref("BadRequestError"),
            404: t.Ref("NotFoundError")
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
          200: t.Ref("CloseRoomResponse"),
          404: t.Ref("NotFoundError")
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
          body: t.Ref("ReportRoomReadyBody"),
          params: roomIdParamsSchema,
          response: {
            200: t.Ref("Room"),
            400: t.Ref("BadRequestError"),
            404: t.Ref("NotFoundError")
          },
          detail: {
            tags: ["Rooms"],
            summary: "Report room ready for manual linking"
          }
        }
      )
  );
