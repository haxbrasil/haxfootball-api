import { describe, expect, it } from "bun:test";
import {
  publicRequest,
  rawRequest,
  request
} from "@/test/e2e/helpers/helpers";

describe("auth", () => {
  it("creates a JWT with a valid API key", async () => {
    const response = await publicRequest("/auth", {
      method: "POST",
      body: {
        apiKey: Bun.env.APP_API_KEY
      }
    });

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
  });

  it("rejects an invalid API key", async () => {
    const response = await publicRequest("/auth", {
      method: "POST",
      body: {
        apiKey: "wrong"
      }
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid API key"
      }
    });
  });

  it("rejects missing or empty API keys through validation", async () => {
    const missingResponse = await publicRequest("/auth", {
      method: "POST",
      body: {}
    });
    const emptyResponse = await publicRequest("/auth", {
      method: "POST",
      body: {
        apiKey: ""
      }
    });

    expect(missingResponse.status).toBe(400);
    expect(await missingResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
    expect(emptyResponse.status).toBe(400);
    expect(await emptyResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
  });

  it("rejects protected routes without a JWT", async () => {
    const response = await rawRequest("/api/accounts");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid bearer token"
      }
    });
  });

  it("rejects malformed bearer tokens and wrong auth schemes", async () => {
    const malformedResponse = await rawRequest("/api/accounts", {
      headers: {
        authorization: "Bearer not-a-jwt"
      }
    });
    const wrongSchemeResponse = await rawRequest("/api/accounts", {
      headers: {
        authorization: "Basic token"
      }
    });

    expect(malformedResponse.status).toBe(401);
    expect(await malformedResponse.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid bearer token"
      }
    });
    expect(wrongSchemeResponse.status).toBe(401);
    expect(await wrongSchemeResponse.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid bearer token"
      }
    });
  });

  it("allows valid tokens to access protected routes", async () => {
    const response = await request("/api/accounts");

    expect(response.status).toBe(200);
  });

  it("keeps public routes unauthenticated", async () => {
    const healthResponse = await rawRequest("/health");
    const authResponse = await publicRequest("/auth", {
      method: "POST",
      body: {
        apiKey: Bun.env.APP_API_KEY
      }
    });

    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ status: "ok" });
    expect(authResponse.status).toBe(200);
  });
});
