import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { stringify } from "yaml";
import { app } from "../src/app";

const outputPath = Bun.argv[2] ?? "openapi.yaml";

const response = await app.handle(new Request("http://localhost/docs/json"));

if (!response.ok) {
  throw new Error(`OpenAPI generation failed: ${response.status}`);
}

const openApiDocument = await response.json();
const output = stringify(openApiDocument, {
  lineWidth: 0,
  sortMapEntries: true
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, "utf8");
