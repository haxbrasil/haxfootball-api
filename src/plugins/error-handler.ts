import { Elysia } from "elysia";
import {
  HttpError,
  errorResponse,
  internalServerError,
  notFound,
  validationError
} from "@/shared/http/errors";

export const errorHandler = () =>
  new Elysia({ name: "error-handler" }).onError(({ code, error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.status;

      return errorResponse(error);
    }

    if (code === "VALIDATION") {
      const httpError = validationError(error.message);
      set.status = httpError.status;

      return errorResponse(httpError);
    }

    if (code === "NOT_FOUND") {
      const httpError = notFound(error.message);
      set.status = httpError.status;

      return errorResponse(httpError);
    }

    const httpError = internalServerError();
    set.status = httpError.status;

    return errorResponse(httpError);
  }).as("global");
