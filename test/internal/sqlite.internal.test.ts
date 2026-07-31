import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { configureSqlite, SQLITE_BUSY_TIMEOUT_MS } from "@/db/sqlite";

const databaseFile = `/tmp/haxfootball-api-sqlite-${crypto.randomUUID()}.sqlite`;

afterAll(() => {
  rmSync(databaseFile, { force: true });
  rmSync(`${databaseFile}-shm`, { force: true });
  rmSync(`${databaseFile}-wal`, { force: true });
});

describe("SQLite runtime policy", () => {
  it("enables foreign keys, WAL, normal durability, and bounded lock waiting", () => {
    const database = new Database(databaseFile);

    configureSqlite(database);

    expect(readPragma(database, "foreign_keys")).toBe(1);
    expect(readPragma(database, "journal_mode")).toBe("wal");
    expect(readPragma(database, "synchronous")).toBe(1);
    expect(readPragma(database, "busy_timeout")).toBe(SQLITE_BUSY_TIMEOUT_MS);
    database.close();
  });

  it("rejects invalid foreign-key writes", () => {
    const database = new Database(databaseFile);

    configureSqlite(database);
    database.exec("CREATE TABLE parent (id INTEGER PRIMARY KEY)");
    database.exec(
      "CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id))"
    );

    expect(() =>
      database.exec("INSERT INTO child (id, parent_id) VALUES (1, 999)")
    ).toThrow();
    database.close();
  });

  it("waits for a competing process to release a write lock", async () => {
    const database = new Database(databaseFile);

    configureSqlite(database);
    database.exec("CREATE TABLE lock_probe (id INTEGER PRIMARY KEY)");
    database.close();

    const worker = `${import.meta.dir}/fixtures/sqlite-lock-worker.ts`;
    const holder = Bun.spawn([process.execPath, worker, "hold", databaseFile], {
      stdout: "pipe",
      stderr: "pipe"
    });
    const holderOutput = holder.stdout.getReader();
    const firstOutput = await holderOutput.read();

    expect(new TextDecoder().decode(firstOutput.value)).toContain("locked");

    const startedAt = performance.now();
    const writer = Bun.spawn(
      [process.execPath, worker, "write", databaseFile],
      { stdout: "pipe", stderr: "pipe" }
    );
    const writerExitCode = await writer.exited;
    const elapsedMs = performance.now() - startedAt;
    const writerError = await new Response(writer.stderr).text();
    const holderExitCode = await holder.exited;
    const holderError = await new Response(holder.stderr).text();

    expect(writerExitCode, writerError).toBe(0);
    expect(holderExitCode, holderError).toBe(0);
    expect(elapsedMs).toBeGreaterThanOrEqual(250);

    const verification = new Database(databaseFile);
    const count = verification
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM lock_probe")
      .get();
    verification.close();

    expect(count?.count).toBe(1);
  });
});

function readPragma(database: Database, pragma: string): string | number {
  const row = database
    .query<Record<string, string | number>, []>(`PRAGMA ${pragma}`)
    .get();

  if (!row) {
    throw new Error(`PRAGMA ${pragma} returned no value`);
  }

  const value = Object.values(row)[0];

  if (value === undefined) {
    throw new Error(`PRAGMA ${pragma} returned an empty row`);
  }

  return value;
}
