import { Elysia } from "elysia";
import { jwtPlugin } from "../plugins/jwt";
import {
  unauthorized,
  unauthorizedErrorResponseSchema
} from "../shared/http/errors";

const bearerPrefix = "Bearer ";

export const withJwtGuard = (app: Elysia) =>
  app.use(jwtPlugin()).guard({
    response: {
      401: unauthorizedErrorResponseSchema
    },
    beforeHandle: async ({ headers, jwt }) => {
      const authorization = headers.authorization;

      if (!authorization?.startsWith(bearerPrefix)) {
        throw unauthorized("Missing or invalid bearer token");
      }

      const payload = await jwt.verify(authorization.slice(bearerPrefix.length));

      if (!payload) {
        throw unauthorized("Missing or invalid bearer token");
      }
    }
  });
