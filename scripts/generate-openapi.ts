import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { stringify } from "yaml";
import { normalizeOpenApiDocument } from "./openapi-normalize";

const outputPath = Bun.argv[2] ?? "openapi.yaml";

Bun.env.APP_API_KEY ??= "openapi-generation";
Bun.env.JWT_SECRET ??= "openapi-generation";
Bun.env.R2_ENDPOINT ??= "https://example.com";
Bun.env.R2_ACCESS_KEY_ID ??= "openapi-generation";
Bun.env.R2_SECRET_ACCESS_KEY ??= "openapi-generation";

const { app } = await import("../src/app");
const response = await app.handle(new Request("http://localhost/docs/json"));

if (!response.ok) {
  throw new Error(`OpenAPI generation failed: ${response.status}`);
}

const openApiDocument = normalizeOpenApiDocument(await response.json());
const output = stringify(openApiDocument, {
  lineWidth: 0,
  sortMapEntries: true
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, "utf8");
