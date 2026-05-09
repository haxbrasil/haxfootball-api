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

async function setupTestDatabase() {
  if (databaseReady) {
    return;
  }

  const database = new Database(Bun.env.DATABASE_FILE);

  for (const migrationFile of readdirSync("drizzle").filter((file) =>
    file.endsWith(".sql")
  ).sort()) {
    database.exec(readFileSync(join("drizzle", migrationFile), "utf8"));
  }

  database.close();
  databaseReady = true;
}

async function getApp() {
  await setupTestDatabase();

  const { app } = await import("../../src/app");

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

  return body.token as string;
}

let authToken: string | undefined;

async function getAuthToken() {
  authToken ??= await createAuthToken();

  return authToken;
}

export async function request(path: string, init: TestRequestInit = {}) {
  const token = await getAuthToken();
  const { body, ...requestInit } = init;

  return rawRequest(path, {
    ...requestInit,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...requestInit.headers
    }
  });
}

export async function publicRequest(path: string, init: TestRequestInit = {}) {
  const { body, ...requestInit } = init;

  return rawRequest(path, {
    ...requestInit,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...requestInit.headers,
      "content-type": "application/json"
    }
  });
}
