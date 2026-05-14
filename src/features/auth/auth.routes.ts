import { Elysia, t } from "elysia";
import {
  createToken,
  createTokenBodySchema,
  createTokenResponseSchema
} from "@/features/auth/create-token";
import { jwtPlugin } from "@/plugins/jwt";
import { unauthorizedErrorResponseSchema } from "@/shared/http/errors";

export const authRoutes = new Elysia({ name: "auth-routes" })
  .use(jwtPlugin())
  .model({
    CreateTokenBody: createTokenBodySchema,
    CreateTokenResponse: createTokenResponseSchema,
    UnauthorizedError: unauthorizedErrorResponseSchema
  })
  .post(
    "/auth",
    ({ body, jwt }) => createToken(body, (payload) => jwt.sign(payload)),
    {
      body: t.Ref("CreateTokenBody"),
      response: {
        200: t.Ref("CreateTokenResponse"),
        401: t.Ref("UnauthorizedError")
      },
      detail: {
        tags: ["Auth"],
        summary: "Create a JWT",
        security: []
      }
    }
  );
