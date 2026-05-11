import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "@/config/env";
import * as schema from "@/db/schema";

mkdirSync(dirname(env.databaseFile), { recursive: true });

const sqlite = new Database(env.databaseFile);

assertSqliteJsonSupport(sqlite);

export const db = drizzle(sqlite, { schema });

type JsonSupportCheckRow = {
  jsonIsValid: number;
};

function assertSqliteJsonSupport(sqlite: Database): void {
  const validJson = '{"ok":true}';
  const jsonSupportCheck = sqlite
    .query<JsonSupportCheckRow, [string]>("select json_valid(?) as jsonIsValid")
    .get(validJson);

  if (jsonSupportCheck?.jsonIsValid !== 1) {
    throw new Error("SQLite JSON support is required");
  }
}
