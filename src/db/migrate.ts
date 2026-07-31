import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { configureSqlite, SQLITE_BUSY_TIMEOUT_MS } from "@/db/sqlite";

type MissingForeignKeyParent = {
  child: string;
  missingParent: string;
};

export function migrateSqlite(input: {
  databaseFile: string;
  migrationsFolder?: string;
}): void {
  const database = new Database(input.databaseFile);

  try {
    database.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
    database.exec("PRAGMA foreign_keys = OFF");
    migrate(drizzle(database), {
      migrationsFolder: input.migrationsFolder ?? "drizzle"
    });
    configureSqlite(database);
    verifyMigratedSchema(database);
  } finally {
    database.close();
  }
}

function verifyMigratedSchema(database: Database): void {
  const integrity = database
    .query<Record<string, string>, []>("PRAGMA integrity_check")
    .get();
  const integrityResult = integrity
    ? (Object.values(integrity)[0] ?? "missing")
    : "missing";

  if (integrityResult !== "ok") {
    throw new Error(`SQLite integrity check failed: ${integrityResult}`);
  }

  const missingParents = database
    .query<MissingForeignKeyParent, []>(
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

  if (missingParents.length > 0) {
    throw new Error(
      `SQLite schema has foreign keys referencing missing tables: ${missingParents
        .map(({ child, missingParent }) => `${child}->${missingParent}`)
        .join(", ")}`
    );
  }

  const violations = database
    .query<Record<string, string | number>, []>("PRAGMA foreign_key_check")
    .all();

  if (violations.length > 0) {
    throw new Error(
      `SQLite foreign-key check found ${violations.length} violation(s)`
    );
  }
}
