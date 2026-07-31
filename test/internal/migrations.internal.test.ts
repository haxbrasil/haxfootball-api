import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { configureSqlite } from "@/db/sqlite";

const databaseFile = `/tmp/haxfootball-api-migrations-${crypto.randomUUID()}.sqlite`;
let database: Database;

beforeAll(async () => {
  database = new Database(databaseFile);

  for (const migrationFile of await migrationSqlFiles()) {
    database.exec(await Bun.file(migrationFile).text());
  }

  configureSqlite(database);
});

afterAll(() => {
  database.close();
  rmSync(databaseFile, { force: true });
  rmSync(`${databaseFile}-shm`, { force: true });
  rmSync(`${databaseFile}-wal`, { force: true });
});

describe("database migrations", () => {
  it("leave no foreign keys pointing at missing tables", () => {
    const missingParents = database
      .query<{ child: string; missingParent: string }, []>(
        `SELECT
          child.name AS child,
          foreign_key.[table] AS missingParent
        FROM sqlite_master AS child
        JOIN pragma_foreign_key_list(child.name) AS foreign_key
        WHERE child.type = 'table'
          AND NOT EXISTS (
            SELECT 1
            FROM sqlite_master AS parent
            WHERE parent.type = 'table'
              AND parent.name = foreign_key.[table]
          )`
      )
      .all();

    expect(missingParents).toEqual([]);
  });

  it("pass SQLite integrity and foreign-key checks", () => {
    const integrity = database
      .query<Record<string, string>, []>("PRAGMA integrity_check")
      .get();
    const violations = database
      .query<Record<string, string | number>, []>("PRAGMA foreign_key_check")
      .all();

    expect(integrity && Object.values(integrity)[0]).toBe("ok");
    expect(violations).toEqual([]);
  });
});

async function migrationSqlFiles(): Promise<string[]> {
  const files: string[] = [];
  const glob = new Bun.Glob("drizzle/*.sql");

  for await (const file of glob.scan()) {
    files.push(file);
  }

  return files.sort();
}
