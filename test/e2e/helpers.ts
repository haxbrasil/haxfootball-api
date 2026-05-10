import { Database } from "bun:sqlite";
import { expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type TestRequestInit = {
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
};

Bun.env.APP_API_KEY ??= "test-api-key";
Bun.env.JWT_SECRET ??= "test-jwt-secret";
Bun.env.DATABASE_FILE ??= `/tmp/haxfootball-api-e2e-${crypto.randomUUID()}.sqlite`;

let databaseReady = false;

function setupTestDatabase() {
  if (databaseReady) {
    return;
  }

  const database = new Database(Bun.env.DATABASE_FILE);

  for (const migrationFile of readdirSync("drizzle").filter((file) =>
    file.endsWith(".sql")
  ).sort()) {
    // Migration files contain multiple statements; Database.run only accepts one.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    database.exec(readFileSync(join("drizzle", migrationFile), "utf8"));
  }

  database.close();
  databaseReady = true;
}

async function getApp() {
  setupTestDatabase();

  const { app } = await import("@/app");

  return app;
}

export async function rawRequest(path: string, init?: RequestInit) {
  const app = await getApp();

  return app.handle(new Request(`http://localhost${path}`, init));
}

export async function createAuthToken() {
  const response = await publicRequest("/auth", {
    method: "POST",
    body: {
      apiKey: Bun.env.APP_API_KEY
    }
  });

  expect(response.status).toBe(200);

  const body = await response.json();

  if (typeof body.token !== "string") {
    throw new Error("Expected auth response to include a token");
  }

  return body.token;
}

let authToken: string | undefined;

async function getAuthToken() {
  authToken ??= await createAuthToken();

  return authToken;
}

export async function request(path: string, init: TestRequestInit = {}) {
  const token = await getAuthToken();
  const { body, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);

  headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");

  return rawRequest(path, {
    ...requestInit,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers
  });
}

export async function publicRequest(path: string, init: TestRequestInit = {}) {
  const { body, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);

  headers.set("content-type", "application/json");

  return rawRequest(path, {
    ...requestInit,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers
  });
}
