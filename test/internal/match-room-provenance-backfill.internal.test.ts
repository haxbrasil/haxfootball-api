import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import {
  applyMatchRoomProvenanceBackfill,
  previewMatchRoomProvenanceBackfill
} from "@/features/matches/room-provenance-backfill";

describe("match room provenance backfill", () => {
  it("resolves one registered HaxFootball room from stints and events", () => {
    const database = fixtureDatabase();
    addMatch(database, 1, "safe0001");
    addPlayer(database, 1, "room-a");
    addPlayer(database, 2, "room-a");
    addStint(database, 1, 1);
    addEvent(database, 1, 1, 2);

    expect(previewMatchRoomProvenanceBackfill(database)).toMatchObject({
      missingProvenance: 1,
      candidates: [
        {
          matchId: 1,
          publicId: "safe0001",
          roomInstanceId: 1,
          roomUuid: "room-a",
          programName: "haxfootball",
          programTitle: "HaxFootball 2",
          programVersion: "v1.0.90",
          participantCount: 2
        }
      ],
      exclusions: []
    });
    database.close();
  });

  it("uses event participants when a match has no stints", () => {
    const database = fixtureDatabase();
    addMatch(database, 1, "events01");
    addPlayer(database, 1, "room-a");
    addEvent(database, 1, 1, null);

    expect(
      previewMatchRoomProvenanceBackfill(database).candidates
    ).toHaveLength(1);
    database.close();
  });

  it("excludes missing, ambiguous, unregistered, and other-program provenance", () => {
    const database = fixtureDatabase();
    addMatch(database, 1, "missing1");
    addMatch(database, 2, "ambig001");
    addMatch(database, 3, "unknown1");
    addMatch(database, 4, "other001");
    addPlayer(database, 1, "room-a");
    addPlayer(database, 2, "room-b");
    addPlayer(database, 3, "not-registered");
    addPlayer(database, 4, "room-other");
    addStint(database, 2, 1);
    addStint(database, 2, 2);
    addStint(database, 3, 3);
    addStint(database, 4, 4);

    expect(
      previewMatchRoomProvenanceBackfill(database).exclusions.map(
        ({ publicId, reason }) => ({ publicId, reason })
      )
    ).toEqual([
      { publicId: "missing1", reason: "no-participant-provenance" },
      { publicId: "ambig001", reason: "ambiguous-room-provenance" },
      { publicId: "unknown1", reason: "room-instance-not-found" },
      { publicId: "other001", reason: "unexpected-room-program" }
    ]);
    database.close();
  });

  it("applies only safe candidates and is idempotent", () => {
    const database = fixtureDatabase();
    addMatch(database, 1, "safe0001");
    addMatch(database, 2, "missing1");
    addMatch(database, 3, "existing", 1);
    addPlayer(database, 1, "room-a");
    addStint(database, 1, 1);

    const applied = applyMatchRoomProvenanceBackfill({
      database,
      expectedCandidates: 1,
      now: "2026-08-02T12:00:00.000Z"
    });

    expect(applied.candidates).toHaveLength(1);
    expect(
      database
        .query<{ roomInstanceId: number | null; updatedAt: string }, []>(
          "SELECT room_instance_id AS roomInstanceId, updated_at AS updatedAt FROM matches WHERE id = 1"
        )
        .get()
    ).toEqual({
      roomInstanceId: 1,
      updatedAt: "2026-08-02T12:00:00.000Z"
    });
    expect(previewMatchRoomProvenanceBackfill(database)).toMatchObject({
      missingProvenance: 1,
      candidates: [],
      exclusions: [{ publicId: "missing1" }]
    });
    database.close();
  });

  it("rolls back when the expected candidate count changed", () => {
    const database = fixtureDatabase();
    addMatch(database, 1, "safe0001");
    addPlayer(database, 1, "room-a");
    addStint(database, 1, 1);

    expect(() =>
      applyMatchRoomProvenanceBackfill({
        database,
        expectedCandidates: 2
      })
    ).toThrow("Expected 2 candidates, found 1");
    expect(
      database
        .query<{ roomInstanceId: number | null }, []>(
          "SELECT room_instance_id AS roomInstanceId FROM matches WHERE id = 1"
        )
        .get()
    ).toEqual({ roomInstanceId: null });
    database.close();
  });
});

function fixtureDatabase(): Database {
  const database = new Database(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE room_programs (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT
    );
    CREATE TABLE room_program_versions (
      id INTEGER PRIMARY KEY,
      program_id INTEGER NOT NULL REFERENCES room_programs(id),
      version TEXT NOT NULL
    );
    CREATE TABLE room_instances (
      id INTEGER PRIMARY KEY,
      uuid TEXT NOT NULL UNIQUE,
      program_id INTEGER NOT NULL REFERENCES room_programs(id),
      version_id INTEGER NOT NULL REFERENCES room_program_versions(id)
    );
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY,
      public_id TEXT NOT NULL,
      room_instance_id INTEGER REFERENCES room_instances(id),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE players (
      id INTEGER PRIMARY KEY,
      room_id TEXT NOT NULL
    );
    CREATE TABLE match_player_stints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id),
      player_id INTEGER NOT NULL REFERENCES players(id)
    );
    CREATE TABLE match_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id),
      actor_player_id INTEGER REFERENCES players(id),
      subject_player_id INTEGER REFERENCES players(id)
    );
  `);
  database.exec(`
    INSERT INTO room_programs (id, name, title)
    VALUES (1, 'haxfootball', 'HaxFootball 2'), (2, 'classic', 'HaxFootball');
    INSERT INTO room_program_versions (id, program_id, version)
    VALUES (1, 1, 'v1.0.90'), (2, 2, 'v1.0.0');
    INSERT INTO room_instances (id, uuid, program_id, version_id)
    VALUES (1, 'room-a', 1, 1), (2, 'room-b', 1, 1), (3, 'room-other', 2, 2);
  `);
  return database;
}

function addMatch(
  database: Database,
  id: number,
  publicId: string,
  roomInstanceId: number | null = null
): void {
  database
    .query(
      "INSERT INTO matches (id, public_id, room_instance_id, updated_at) VALUES (?, ?, ?, 'old')"
    )
    .run(id, publicId, roomInstanceId);
}

function addPlayer(database: Database, id: number, roomId: string): void {
  database
    .query("INSERT INTO players (id, room_id) VALUES (?, ?)")
    .run(id, roomId);
}

function addStint(database: Database, matchId: number, playerId: number): void {
  database
    .query(
      "INSERT INTO match_player_stints (match_id, player_id) VALUES (?, ?)"
    )
    .run(matchId, playerId);
}

function addEvent(
  database: Database,
  matchId: number,
  actorPlayerId: number | null,
  subjectPlayerId: number | null
): void {
  database
    .query(
      "INSERT INTO match_events (match_id, actor_player_id, subject_player_id) VALUES (?, ?, ?)"
    )
    .run(matchId, actorPlayerId, subjectPlayerId);
}
