import { t, type Elysia } from "elysia";
import {
  badRequestOrValidationErrorResponseSchema,
  conflictErrorResponseSchema,
  forbiddenErrorResponseSchema,
  internalServerErrorResponseSchema
} from "@/shared/http/errors";
import { pageInfoSchema } from "@lib";

export const withCommonErrorResponses = (app: Elysia) =>
  app
    .model({
      BadRequestOrValidationError: badRequestOrValidationErrorResponseSchema,
      ConflictError: conflictErrorResponseSchema,
      ForbiddenError: forbiddenErrorResponseSchema,
      InternalServerError: internalServerErrorResponseSchema,
      PageInfo: pageInfoSchema
    })
    .guard({
      response: {
        400: t.Ref("BadRequestOrValidationError"),
        403: t.Ref("ForbiddenError"),
        409: t.Ref("ConflictError"),
        500: t.Ref("InternalServerError")
      }
    });
