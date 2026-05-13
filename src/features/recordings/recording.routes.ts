import { Elysia } from "elysia";
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
  .get("", ({ query }) => listRecordings(query), {
    query: paginationQuerySchema,
    response: {
      200: listRecordingsResponseSchema
    },
    detail: {
      tags: ["Recordings"],
      summary: "List recordings"
    }
  })
  .get("/:id", ({ params }) => getRecording(params.id), {
    params: recordingPublicIdParamsSchema,
    response: {
      200: recordingResponseSchema,
      404: notFoundErrorResponseSchema
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
      body: createRecordingBodySchema,
      response: {
        200: recordingResponseSchema,
        201: recordingResponseSchema,
        400: badRequestErrorResponseSchema
      },
      detail: {
        tags: ["Recordings"],
        summary: "Save a recording"
      }
    }
  );
