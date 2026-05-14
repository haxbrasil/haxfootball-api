import { Elysia, t } from "elysia";
import {
  createRecording,
  createRecordingBodySchema
} from "@/features/recordings/create-recording";
import { getRecording } from "@/features/recordings/get-recording";
import {
  listRecordings,
  listRecordingsResponseSchema
} from "@/features/recordings/list-recordings";
import {
  recordingPublicIdParamsSchema,
  recordingResponseSchema
} from "@/features/recordings/recording.contract";
import {
  badRequestErrorResponseSchema,
  notFoundErrorResponseSchema
} from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export const recordingRoutes = new Elysia({
  name: "recording-routes",
  prefix: "/recs"
})
  .model({
    BadRequestError: badRequestErrorResponseSchema,
    CreateRecordingBody: createRecordingBodySchema,
    ListRecordings: listRecordingsResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    Recording: recordingResponseSchema
  })
  .get("", ({ query }) => listRecordings(query), {
    query: paginationQuerySchema,
    response: {
      200: t.Ref("ListRecordings")
    },
    detail: {
      tags: ["Recordings"],
      summary: "List recordings"
    }
  })
  .get("/:id", ({ params }) => getRecording(params.id), {
    params: recordingPublicIdParamsSchema,
    response: {
      200: t.Ref("Recording"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Recordings"],
      summary: "Get a recording"
    }
  })
  .post(
    "",
    async ({ body, set }) => {
      const result = await createRecording(body);

      set.status = result.created ? 201 : 200;

      return result.recording;
    },
    {
      body: t.Ref("CreateRecordingBody"),
      response: {
        200: t.Ref("Recording"),
        201: t.Ref("Recording"),
        400: t.Ref("BadRequestError")
      },
      detail: {
        tags: ["Recordings"],
        summary: "Save a recording"
      }
    }
  );
