import { jwt } from "@elysiajs/jwt";
import { type Static, t } from "elysia";
import { env } from "@/config/env";

export const jwtPayloadSchema = t.Object({
  sub: t.Literal("app"),
  kind: t.Literal("api")
});

export type JwtPayload = Static<typeof jwtPayloadSchema>;
export type JwtSignPayload = JwtPayload & {
  iat: boolean;
};
export type SignJwt = (payload: JwtSignPayload) => Promise<string>;

export const jwtPlugin = () =>
  jwt({
    name: "jwt",
    secret: env.jwtSecret,
    schema: jwtPayloadSchema
  });
