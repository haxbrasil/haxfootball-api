import type { Elysia } from "elysia";
import {
  badRequestOrValidationErrorResponseSchema,
  internalServerErrorResponseSchema
} from "@/shared/http/errors";

export const withCommonErrorResponses = (app: Elysia) =>
  app.guard({
    response: {
      400: badRequestOrValidationErrorResponseSchema,
      500: internalServerErrorResponseSchema
    }
  });
