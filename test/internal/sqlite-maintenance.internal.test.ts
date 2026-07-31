import { Database } from "bun:sqlite";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import {
  createSqliteBackup,
  restoreSqliteBackup,
  verifySqliteFile
} from "@/db/maintenance";

const root = `/tmp/haxfootball-api-backup-${crypto.randomUUID()}`;
const databaseFile = `${root}/app.sqlite`;
const backupDirectory = `${root}/backups`;

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(root, { recursive: true, force: true });
  createFixtureDatabase();
});

describe("SQLite maintenance", () => {
  it("creates a verified consistent backup with deployment metadata", () => {
    const backupFile = createSqliteBackup({
      databaseFile,
      backupDirectory,
      sourceSha: "abc123"
    });

    expect(readValue(backupFile)).toBe("before");
    expect(verifySqliteFile(backupFile)).toEqual({
      integrity: "ok",
      foreignKeyViolations: []
    });
    expect(readFileSync(`${backupFile}.json`, "utf8")).toContain("abc123");
  });

  it("restores atomically and preserves the failed database for diagnosis", () => {
    const backupFile = createSqliteBackup({
      databaseFile,
      backupDirectory,
      sourceSha: "restore"
    });
    writeValue("after");

    const failedFile = restoreSqliteBackup({ databaseFile, backupFile });

    expect(readValue(databaseFile)).toBe("before");
    expect(readValue(failedFile)).toBe("after");
  });
});

function createFixtureDatabase(): void {
  mkdirSync(root, { recursive: true });
  const database = new Database(databaseFile);

  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("CREATE TABLE parent (id INTEGER PRIMARY KEY, value TEXT)");
  database.exec(
    "CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))"
  );
  database.query("INSERT INTO parent (id, value) VALUES (1, ?)").run("before");
  database.query("INSERT INTO child (id, parent_id) VALUES (1, 1)").run();
  database.close();
}

function writeValue(value: string): void {
  const database = new Database(databaseFile);

  database.query("UPDATE parent SET value = ? WHERE id = 1").run(value);
  database.close();
}

function readValue(file: string): string {
  const database = new Database(file, { readonly: true });

  try {
    const row = database
      .query<{ value: string }, []>("SELECT value FROM parent WHERE id = 1")
      .get();

    if (!row) {
      throw new Error("Fixture value was not found");
    }

    return row.value;
  } finally {
    database.close();
  }
}
