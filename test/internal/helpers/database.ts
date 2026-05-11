import { Database } from "bun:sqlite";

Bun.env.APP_API_KEY ??= "test-api-key";
Bun.env.JWT_SECRET ??= "test-jwt-secret";
Bun.env.DATABASE_FILE ??= `/tmp/haxfootball-api-internal-${crypto.randomUUID()}.sqlite`;
Bun.env.R2_ENDPOINT ??= "https://example.r2.cloudflarestorage.com";
Bun.env.R2_ACCESS_KEY_ID ??= "test-access-key-id";
Bun.env.R2_SECRET_ACCESS_KEY ??= "test-secret-access-key";
Bun.env.R2_PUBLIC_BASE_URL ??= "https://recs.haxbrasil.com";

let databaseReady = false;

export async function setupInternalTestDatabase(): Promise<void> {
  if (databaseReady) {
    return;
  }

  const database = new Database(Bun.env.DATABASE_FILE);
  const migrationFiles = await migrationSqlFiles();

  for (const migrationFile of migrationFiles) {
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
