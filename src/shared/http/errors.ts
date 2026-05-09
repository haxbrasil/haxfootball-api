import { t } from "elysia";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_SERVER_ERROR";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (message = "Unauthorized") =>
  new HttpError(401, "UNAUTHORIZED", message);

export const notFound = (message = "Resource not found") =>
  new HttpError(404, "NOT_FOUND", message);

export const validationError = (message: string) =>
  new HttpError(400, "VALIDATION_ERROR", message);

export const internalServerError = () =>
  new HttpError(500, "INTERNAL_SERVER_ERROR", "Unexpected server error");

const errorResponseSchema = <Code extends ErrorCode>(code: Code) =>
  t.Object({
    error: t.Object({
      code: t.Literal(code),
      message: t.String()
    })
  });

export const unauthorizedErrorResponseSchema =
  errorResponseSchema("UNAUTHORIZED");

export const notFoundErrorResponseSchema = errorResponseSchema("NOT_FOUND");

export const validationErrorResponseSchema =
  errorResponseSchema("VALIDATION_ERROR");

export const internalServerErrorResponseSchema = errorResponseSchema(
  "INTERNAL_SERVER_ERROR"
);

export const errorResponseSchemas = {
  unauthorized: unauthorizedErrorResponseSchema,
  notFound: notFoundErrorResponseSchema,
  validation: validationErrorResponseSchema,
  internalServer: internalServerErrorResponseSchema
};

export type ErrorResponse = {
  error: {
    code: ErrorCode;
    message: string;
  };
};

export function errorResponse(error: HttpError): ErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message
    }
  };
}
