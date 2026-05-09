import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "@/config/env";
import * as schema from "@/db/schema";

mkdirSync(dirname(env.databaseFile), { recursive: true });

const sqlite = new Database(env.databaseFile);

export const db = drizzle(sqlite, { schema });
