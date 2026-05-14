import { t, type Elysia } from "elysia";
import {
  badRequestOrValidationErrorResponseSchema,
  internalServerErrorResponseSchema
} from "@/shared/http/errors";
import { pageInfoSchema } from "@lib";

export const withCommonErrorResponses = (app: Elysia) =>
  app
    .model({
      BadRequestOrValidationError: badRequestOrValidationErrorResponseSchema,
      InternalServerError: internalServerErrorResponseSchema,
      PageInfo: pageInfoSchema
    })
    .guard({
      response: {
        400: t.Ref("BadRequestOrValidationError"),
        500: t.Ref("InternalServerError")
      }
    });
