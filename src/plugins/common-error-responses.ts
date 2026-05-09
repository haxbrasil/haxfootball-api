import { Elysia } from "elysia";
import {
  internalServerErrorResponseSchema,
  validationErrorResponseSchema
} from "../shared/http/errors";

export const withCommonErrorResponses = (app: Elysia) =>
  app.guard({
    response: {
      400: validationErrorResponseSchema,
      500: internalServerErrorResponseSchema
    }
  });
