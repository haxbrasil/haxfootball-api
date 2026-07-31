import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { migrateSqlite } from "@/db/migrate";

const databaseFile = `/tmp/haxfootball-api-migration-rehearsal-${crypto.randomUUID()}.sqlite`;
const timestamp = "2026-07-30T00:00:00.000Z";

beforeAll(async () => {
  const database = new Database(databaseFile);
  const migrationFiles = await migrationSqlFiles();

  for (const migrationFile of migrationFiles.filter(
    (file) => file < "drizzle/0027_"
  )) {
    database.exec(await Bun.file(migrationFile).text());
  }

  database.exec("PRAGMA foreign_keys = OFF");
  seedPopulatedLegacyDatabase(database);
  database.exec(`
    CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    );
    INSERT INTO __drizzle_migrations (hash, created_at)
    VALUES ('legacy-fixture', 1785245840492);
  `);
  database.close();

  migrateSqlite({ databaseFile });
});

afterAll(() => {
  rmSync(databaseFile, { force: true });
  rmSync(`${databaseFile}-shm`, { force: true });
  rmSync(`${databaseFile}-wal`, { force: true });
});

describe("populated database migration rehearsal", () => {
  it("preserves match data and every inbound match reference", () => {
    const database = new Database(databaseFile, { readonly: true });

    expect(countRows(database, "matches")).toBe(1);
    expect(countRows(database, "match_events")).toBe(1);
    expect(countRows(database, "room_instance_events")).toBe(1);
    expect(countRows(database, "match_player_stints")).toBe(1);
    expect(countRows(database, "match_team_metadata")).toBe(1);
    expect(countRows(database, "composed_matches")).toBe(1);
    expect(countRows(database, "composed_match_rounds")).toBe(1);
    database.close();
  });

  it("repairs legacy schema references and enforces match room provenance", () => {
    const database = new Database(databaseFile);
    database.exec("PRAGMA foreign_keys = ON");
    const schemaParents = database
      .query<{ table: string }, []>(
        "PRAGMA foreign_key_list(event_schema_versions)"
      )
      .all();
    const matchParents = database
      .query<{ table: string }, []>("PRAGMA foreign_key_list(matches)")
      .all();

    expect(schemaParents.map(({ table }) => table)).toContain(
      "event_schema_families"
    );
    expect(matchParents.map(({ table }) => table)).toContain("room_instances");
    expect(() =>
      database
        .query(
          `INSERT INTO matches
            (public_id, status, room_instance_id, created_at, updated_at)
          VALUES (?, 'ongoing', 999999999, ?, ?)`
        )
        .run("orphan-room", timestamp, timestamp)
    ).toThrow();
    database.close();
  });
});

function seedPopulatedLegacyDatabase(database: Database): void {
  database.exec(`
    INSERT INTO room_programs (
      id, uuid, name, release_source, launch_config_fields,
      haxball_token_env_var, created_at, updated_at
    ) VALUES (
      1, '00000000-0000-4000-8000-000000000001', 'migration-program',
      '{}', '[]', 'HAXBALL_TOKEN', '${timestamp}', '${timestamp}'
    );
    INSERT INTO room_program_versions (
      id, uuid, program_id, version, artifact, entrypoint,
      install_strategy, created_at, updated_at
    ) VALUES (
      1, '00000000-0000-4000-8000-000000000002', 1, '1.0.0',
      '{}', 'index.js', 'none', '${timestamp}', '${timestamp}'
    );
    INSERT INTO room_instances (
      id, uuid, program_id, version_id, state, launch_config,
      public, comm_id_hash, created_at, updated_at
    ) VALUES (
      1, '00000000-0000-4000-8000-000000000003', 1, 1, 'closed',
      '{}', 0, 'fixture', '${timestamp}', '${timestamp}'
    );
    INSERT INTO event_schema_families (
      id, uuid, name, created_at, updated_at
    ) VALUES (
      1, '00000000-0000-4000-8000-000000000004', 'migration-schema',
      '${timestamp}', '${timestamp}'
    );
    INSERT INTO event_schema_versions (
      id, family_id, version, definition, created_at, updated_at
    ) VALUES (1, 1, 1, '{}', '${timestamp}', '${timestamp}');
    INSERT INTO players (
      id, external_id, name, created_at, updated_at, identity_key,
      room_id, room_player_id
    ) VALUES (
      1, 'migration-player', 'Migration Player', '${timestamp}', '${timestamp}',
      'migration-player', 'migration-room', 1
    );
    INSERT INTO matches (
      id, public_id, status, room_instance_id, event_schema_version_id,
      created_at, updated_at
    ) VALUES (
      1, 'migration-match', 'ongoing', 1, 1, '${timestamp}', '${timestamp}'
    );
    INSERT INTO match_events (
      id, uuid, match_id, schema_version_id, sequence, domain, type, scope,
      actor_player_id, value, created_at, updated_at
    ) VALUES (
      1, '00000000-0000-4000-8000-000000000005', 1, 1, 1,
      'game', 'fixture', 'player', 1, '{}', '${timestamp}', '${timestamp}'
    );
    INSERT INTO room_instance_events (
      id, uuid, room_instance_id, match_id, sequence, domain, type, scope,
      value, created_at, updated_at
    ) VALUES (
      1, '00000000-0000-4000-8000-000000000006', 1, 1, 1,
      'room', 'fixture', 'room', '{}', '${timestamp}', '${timestamp}'
    );
    INSERT INTO match_player_stints (
      id, match_id, player_id, team, created_at
    ) VALUES (1, 1, 1, 'red', '${timestamp}');
    INSERT INTO match_team_metadata (
      id, match_id, team, score, created_at, updated_at
    ) VALUES (1, 1, 'red', 1, '${timestamp}', '${timestamp}');
    INSERT INTO composed_matches (
      id, public_id, first_match_id, created_at, updated_at
    ) VALUES (1, 'c23456789', 1, '${timestamp}', '${timestamp}');
    INSERT INTO composed_match_rounds (
      id, composed_match_id, match_id, kind, round_number, position, created_at
    ) VALUES (1, 1, 1, 'sequential', 1, 1, '${timestamp}');
  `);
}

function countRows(database: Database, table: string): number {
  const row = database
    .query<{ count: number }, []>(`SELECT count(*) AS count FROM ${table}`)
    .get();

  return row?.count ?? 0;
}

async function migrationSqlFiles(): Promise<string[]> {
  const files: string[] = [];
  const glob = new Bun.Glob("drizzle/*.sql");

  for await (const file of glob.scan()) {
    files.push(file);
  }

  return files.sort();
}
