import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";

const databaseFile = `/tmp/haxfootball-scheduling-migration-${crypto.randomUUID()}.sqlite`;
let database: Database;

beforeAll(async () => {
  database = new Database(databaseFile);
  const files = await migrationSqlFiles();

  for (const file of files.filter((path) => path < "drizzle/0036_")) {
    database.exec(await Bun.file(file).text());
  }
  database.exec("PRAGMA foreign_keys = OFF");
  database.exec(`
    INSERT INTO championship_late_play_authorizations (
      id, championship_match_id, authorized_by_account_id, reason, created_at
    ) VALUES (1, 10, 20, 'Legacy approval', '2026-07-30T00:00:00.000Z');
    INSERT INTO championship_schedule_proposals (
      id, uuid, championship_match_id, proposing_account_id, mode,
      exact_time, state, created_at, updated_at
    ) VALUES (
      1, '00000000-0000-4000-8000-000000000001', 10, 20, 'exact-time',
      '2026-07-31T00:00:00.000Z', 'pending',
      '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'
    );
  `);
  const migration = files.find((path) => path.startsWith("drizzle/0036_"));

  if (!migration) {
    throw new Error("Scheduling migration was not generated");
  }
  database.exec(await Bun.file(migration).text());
});

afterAll(() => {
  database.close();
  rmSync(databaseFile, { force: true });
});

describe("championship scheduling migration", () => {
  it("backfills stable UUIDs for existing late-play approvals", () => {
    const row = database
      .query<{ uuid: string; revision: number }, []>(
        "SELECT uuid, revision FROM championship_late_play_authorizations WHERE id = 1"
      )
      .get();

    expect(row?.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(row?.revision).toBe(0);
  });

  it("preserves proposals and initializes their revision", () => {
    expect(
      database
        .query<{ uuid: string; revision: number }, []>(
          "SELECT uuid, revision FROM championship_schedule_proposals WHERE id = 1"
        )
        .get()
    ).toEqual({
      uuid: "00000000-0000-4000-8000-000000000001",
      revision: 0
    });
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
