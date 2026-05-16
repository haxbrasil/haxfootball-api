import { Database } from "bun:sqlite";
import { expect } from "bun:test";

type TestRequestInit = {
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
};

type PaginatedResponse<T> = {
  items: T[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
};

Bun.env.APP_API_KEY ??= "test-api-key";
Bun.env.JWT_SECRET ??= "test-jwt-secret";
Bun.env.DATABASE_FILE ??= `/tmp/haxfootball-api-e2e-${crypto.randomUUID()}.sqlite`;
Bun.env.R2_ENDPOINT ??= "https://example.r2.cloudflarestorage.com";
Bun.env.R2_ACCESS_KEY_ID ??= "test-access-key-id";
Bun.env.R2_SECRET_ACCESS_KEY ??= "test-secret-access-key";
Bun.env.R2_PUBLIC_BASE_URL ??= "https://recs.haxbrasil.com";
Bun.env.ROOM_GITHUB_API_BASE_URL ??= "http://127.0.0.1:19081";
Bun.env.PUBLIC_BASE_URL ??= "http://127.0.0.1:19081";
Bun.env.ROOM_ARTIFACT_STORAGE_DIR ??= `/tmp/haxfootball-api-room-artifacts-${crypto.randomUUID()}`;
Bun.env.ROOM_PROCESS_RUNNER ??= "node";
Bun.env.ROOM_PACKAGE_CACHE_DIR ??= `/tmp/haxfootball-api-room-packages-${crypto.randomUUID()}`;
Bun.env.ROOM_PROCESS_LOG_DIR ??= `/tmp/haxfootball-api-room-logs-${crypto.randomUUID()}`;

let databaseReady = false;

export async function setupTestDatabase(): Promise<void> {
  if (databaseReady) {
    return;
  }

  const database = new Database(Bun.env.DATABASE_FILE);
  const migrationFiles = await migrationSqlFiles();

  for (const migrationFile of migrationFiles) {
    // Migration files contain multiple statements; Database.run only accepts one.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    database.exec(await Bun.file(migrationFile).text());
  }

  database.close();
  databaseReady = true;
}

async function migrationSqlFiles(): Promise<string[]> {
  const files: string[] = [];
  const glob = new Bun.Glob("drizzle/*.sql");

  for await (const file of glob.scan()) {
    files.push(file);
  }

  return files.sort();
}

async function getApp() {
  await setupTestDatabase();

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

  if (!isNativeBody(body)) {
    headers.set("content-type", "application/json");
  }

  return rawRequest(path, {
    ...requestInit,
    body: serializeBody(body),
    headers
  });
}

export async function publicRequest(path: string, init: TestRequestInit = {}) {
  const { body, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);

  if (!isNativeBody(body)) {
    headers.set("content-type", "application/json");
  }

  return rawRequest(path, {
    ...requestInit,
    body: serializeBody(body),
    headers
  });
}

export async function paginatedBody<T>(
  response: Response
): Promise<PaginatedResponse<T>> {
  const body: PaginatedResponse<T> = await response.json();

  expect(Array.isArray(body.items)).toBe(true);
  expect(typeof body.page.limit).toBe("number");
  expect(
    typeof body.page.nextCursor === "string" || body.page.nextCursor === null
  ).toBe(true);

  return body;
}

export async function paginatedItems<T>(response: Response): Promise<T[]> {
  const body = await paginatedBody<T>(response);

  return body.items;
}

function serializeBody(body: unknown): BodyInit | null | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (isNativeBody(body)) {
    return body;
  }

  return JSON.stringify(body);
}

function isNativeBody(body: unknown): body is BodyInit {
  return (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof ReadableStream ||
    ArrayBuffer.isView(body) ||
    typeof body === "string"
  );
}
