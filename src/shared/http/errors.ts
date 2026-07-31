import { t } from "elysia";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "INTERNAL_SERVER_ERROR";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (message = "Unauthorized") =>
  new HttpError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "Forbidden") =>
  new HttpError(403, "FORBIDDEN", message);

export const notFound = (message = "Resource not found") =>
  new HttpError(404, "NOT_FOUND", message);

export const badRequest = (message: string) =>
  new HttpError(400, "BAD_REQUEST", message);

export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, "CONFLICT", message, details);

export const validationError = (message: string) =>
  new HttpError(400, "VALIDATION_ERROR", message);

export const internalServerError = () =>
  new HttpError(500, "INTERNAL_SERVER_ERROR", "Unexpected server error");

const errorResponseSchema = <Code extends ErrorCode>(code: Code) =>
  t.Object({
    error: t.Object({
      code: t.Literal(code),
      message: t.String(),
      details: t.Optional(t.Unknown())
    })
  });

export const unauthorizedErrorResponseSchema =
  errorResponseSchema("UNAUTHORIZED");

export const forbiddenErrorResponseSchema = errorResponseSchema("FORBIDDEN");

export const notFoundErrorResponseSchema = errorResponseSchema("NOT_FOUND");

export const badRequestErrorResponseSchema = errorResponseSchema("BAD_REQUEST");

export const conflictErrorResponseSchema = errorResponseSchema("CONFLICT");

export const validationErrorResponseSchema =
  errorResponseSchema("VALIDATION_ERROR");

export const badRequestOrValidationErrorResponseSchema = t.Union([
  badRequestErrorResponseSchema,
  validationErrorResponseSchema
]);

export const internalServerErrorResponseSchema = errorResponseSchema(
  "INTERNAL_SERVER_ERROR"
);

export const errorResponseSchemas = {
  unauthorized: unauthorizedErrorResponseSchema,
  forbidden: forbiddenErrorResponseSchema,
  notFound: notFoundErrorResponseSchema,
  badRequest: badRequestErrorResponseSchema,
  conflict: conflictErrorResponseSchema,
  validation: validationErrorResponseSchema,
  internalServer: internalServerErrorResponseSchema
};

export type ErrorResponse = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export function errorResponse(error: HttpError): ErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    }
  };
}
