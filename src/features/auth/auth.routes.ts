import { Elysia } from "elysia";
import {
  createToken,
  createTokenBodySchema,
  createTokenResponseSchema
} from "@/features/auth/create-token";
import { jwtPlugin } from "@/plugins/jwt";
import { unauthorizedErrorResponseSchema } from "@/shared/http/errors";

export const authRoutes = new Elysia({ name: "auth-routes" })
  .use(jwtPlugin())
  .post(
    "/auth",
    ({ body, jwt }) => createToken(body, jwt.sign),
    {
      body: createTokenBodySchema,
      response: {
        200: createTokenResponseSchema,
        401: unauthorizedErrorResponseSchema
      },
      detail: {
        tags: ["Auth"],
        summary: "Create a JWT",
        security: []
      }
    }
  );
