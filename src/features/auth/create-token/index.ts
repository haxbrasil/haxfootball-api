import { type Static, t } from "elysia";
import { env } from "@/config/env";
import { type SignJwt } from "@/plugins/jwt";
import { unauthorized } from "@/shared/http/errors";

export const createTokenBodySchema = t.Object({
  apiKey: t.String({ minLength: 1 })
});

export const createTokenResponseSchema = t.Object({
  token: t.String({ minLength: 1 })
});

export type CreateTokenInput = Static<typeof createTokenBodySchema>;
export type CreateTokenResult = Static<typeof createTokenResponseSchema>;

export async function createToken(
  input: CreateTokenInput,
  signToken: SignJwt
): Promise<CreateTokenResult> {
  if (input.apiKey !== env.appApiKey) {
    throw unauthorized("Missing or invalid API key");
  }

  return {
    token: await signToken({
      sub: "app",
      kind: "api",
      iat: true
    })
  };
}
