import type { Database } from "bun:sqlite";

export const SQLITE_BUSY_TIMEOUT_MS = 5_000;

export function configureSqlite(database: Database): void {
  database.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");

  assertPragma(database, "foreign_keys", 1);
  assertPragma(database, "journal_mode", "wal");
  assertPragma(database, "busy_timeout", SQLITE_BUSY_TIMEOUT_MS);
}

function assertPragma(
  database: Database,
  pragma: string,
  expected: string | number
): void {
  const row = database
    .query<Record<string, string | number>, []>(`PRAGMA ${pragma}`)
    .get();
  const actual = row ? Object.values(row)[0] : undefined;

  if (actual !== expected) {
    throw new Error(
      `SQLite PRAGMA ${pragma} must be ${String(expected)}; received ${String(actual)}`
    );
  }
}
