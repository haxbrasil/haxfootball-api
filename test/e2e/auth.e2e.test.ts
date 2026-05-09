import { describe, expect, it } from "bun:test";
import { publicRequest, rawRequest } from "@/test/e2e/helpers";

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
});
