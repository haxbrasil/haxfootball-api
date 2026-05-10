import { Database } from "bun:sqlite";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
Bun.env.R2_ENDPOINT ??= "https://example.r2.cloudflarestorage.com";
Bun.env.R2_ACCESS_KEY_ID ??= "test-access-key-id";
Bun.env.R2_SECRET_ACCESS_KEY ??= "test-secret-access-key";
Bun.env.R2_PUBLIC_BASE_URL ??= "https://recs.haxbrasil.com";

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

export async function recordingObjectExists(key: string): Promise<boolean> {
  const client = new S3Client({
    endpoint: Bun.env.R2_ENDPOINT ?? "https://example.r2.cloudflarestorage.com",
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: Bun.env.R2_ACCESS_KEY_ID ?? "test-access-key-id",
      secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY ?? "test-secret-access-key"
    }
  });

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: Bun.env.R2_BUCKET ?? "recs",
        Key: key
      })
    );

    return true;
  } catch {
    return false;
  }
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
