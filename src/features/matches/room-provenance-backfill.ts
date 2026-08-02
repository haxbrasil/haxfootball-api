import { Database } from "bun:sqlite";
import { configureSqlite } from "@/db/sqlite";

const EXPECTED_PROGRAM_NAME = "haxfootball";

type ProvenanceRow = {
  matchId: number;
  publicId: string;
  participantReferenceCount: number;
  participantCount: number;
  roomUuidCount: number;
  roomUuid: string | null;
  roomInstanceId: number | null;
  programName: string | null;
  programTitle: string | null;
  programVersion: string | null;
};

export type MatchRoomProvenanceCandidate = {
  matchId: number;
  publicId: string;
  roomInstanceId: number;
  roomUuid: string;
  programName: string;
  programTitle: string | null;
  programVersion: string;
  participantReferenceCount: number;
  participantCount: number;
};

export type MatchRoomProvenanceExclusion = {
  matchId: number;
  publicId: string;
  reason:
    | "no-participant-provenance"
    | "ambiguous-room-provenance"
    | "room-instance-not-found"
    | "unexpected-room-program";
  roomUuids: number;
  roomUuid: string | null;
  programName: string | null;
};

export type MatchRoomProvenancePreview = {
  missingProvenance: number;
  candidates: MatchRoomProvenanceCandidate[];
  exclusions: MatchRoomProvenanceExclusion[];
};

export function openMatchRoomProvenanceDatabase(
  databaseFile: string
): Database {
  const database = new Database(databaseFile);
  configureSqlite(database);
  return database;
}

export function previewMatchRoomProvenanceBackfill(
  database: Database
): MatchRoomProvenancePreview {
  const rows = database.query<ProvenanceRow, []>(PROVENANCE_QUERY).all();
  const candidates: MatchRoomProvenanceCandidate[] = [];
  const exclusions: MatchRoomProvenanceExclusion[] = [];

  for (const row of rows) {
    if (row.roomUuidCount === 0 || row.roomUuid === null) {
      exclusions.push(toExclusion(row, "no-participant-provenance"));
      continue;
    }

    if (row.roomUuidCount !== 1) {
      exclusions.push(toExclusion(row, "ambiguous-room-provenance"));
      continue;
    }

    if (row.roomInstanceId === null) {
      exclusions.push(toExclusion(row, "room-instance-not-found"));
      continue;
    }

    if (row.programName !== EXPECTED_PROGRAM_NAME) {
      exclusions.push(toExclusion(row, "unexpected-room-program"));
      continue;
    }

    if (row.programVersion === null) {
      throw new Error(
        `Room instance ${row.roomInstanceId} has no registered program version`
      );
    }

    candidates.push({
      matchId: row.matchId,
      publicId: row.publicId,
      roomInstanceId: row.roomInstanceId,
      roomUuid: row.roomUuid,
      programName: row.programName,
      programTitle: row.programTitle,
      programVersion: row.programVersion,
      participantReferenceCount: row.participantReferenceCount,
      participantCount: row.participantCount
    });
  }

  return {
    missingProvenance: rows.length,
    candidates,
    exclusions
  };
}

export function applyMatchRoomProvenanceBackfill(input: {
  database: Database;
  expectedCandidates: number;
  now?: string;
}): MatchRoomProvenancePreview {
  input.database.exec("BEGIN IMMEDIATE");

  try {
    const preview = previewMatchRoomProvenanceBackfill(input.database);

    if (preview.candidates.length !== input.expectedCandidates) {
      throw new Error(
        `Expected ${input.expectedCandidates} candidates, found ${preview.candidates.length}`
      );
    }

    const update = input.database.query<void, [number, string, number]>(
      "UPDATE matches SET room_instance_id = ?, updated_at = ? WHERE id = ? AND room_instance_id IS NULL"
    );
    const now = input.now ?? new Date().toISOString();
    let changedRows = 0;

    for (const candidate of preview.candidates) {
      changedRows += Number(
        update.run(candidate.roomInstanceId, now, candidate.matchId).changes
      );
    }

    if (changedRows !== preview.candidates.length) {
      throw new Error(
        `Expected to update ${preview.candidates.length} matches, updated ${changedRows}`
      );
    }

    assertDatabaseHealth(input.database);
    input.database.exec("COMMIT");
    return preview;
  } catch (error) {
    input.database.exec("ROLLBACK");
    throw error;
  }
}

function toExclusion(
  row: ProvenanceRow,
  reason: MatchRoomProvenanceExclusion["reason"]
): MatchRoomProvenanceExclusion {
  return {
    matchId: row.matchId,
    publicId: row.publicId,
    reason,
    roomUuids: row.roomUuidCount,
    roomUuid: row.roomUuid,
    programName: row.programName
  };
}

function assertDatabaseHealth(database: Database): void {
  const quickCheck = database
    .query<Record<string, string>, []>("PRAGMA quick_check")
    .get();
  const quickCheckResult = quickCheck
    ? (Object.values(quickCheck)[0] ?? "missing")
    : "missing";

  if (quickCheckResult !== "ok") {
    throw new Error(`SQLite quick check failed: ${quickCheckResult}`);
  }

  const foreignKeyViolations = database
    .query<Record<string, unknown>, []>("PRAGMA foreign_key_check")
    .all();

  if (foreignKeyViolations.length > 0) {
    throw new Error(
      `SQLite foreign-key check found ${foreignKeyViolations.length} violation(s)`
    );
  }
}

const PROVENANCE_QUERY = `
  WITH participant_references AS (
    SELECT s.match_id, s.player_id, p.room_id AS room_uuid
    FROM match_player_stints s
    JOIN players p ON p.id = s.player_id

    UNION ALL

    SELECT e.match_id, e.actor_player_id AS player_id, p.room_id AS room_uuid
    FROM match_events e
    JOIN players p ON p.id = e.actor_player_id
    WHERE e.actor_player_id IS NOT NULL

    UNION ALL

    SELECT e.match_id, e.subject_player_id AS player_id, p.room_id AS room_uuid
    FROM match_events e
    JOIN players p ON p.id = e.subject_player_id
    WHERE e.subject_player_id IS NOT NULL
  ),
  evidence AS (
    SELECT
      match_id,
      COUNT(*) AS participant_reference_count,
      COUNT(DISTINCT player_id) AS participant_count,
      COUNT(DISTINCT room_uuid) AS room_uuid_count,
      MIN(room_uuid) AS room_uuid
    FROM participant_references
    GROUP BY match_id
  )
  SELECT
    m.id AS matchId,
    m.public_id AS publicId,
    COALESCE(e.participant_reference_count, 0) AS participantReferenceCount,
    COALESCE(e.participant_count, 0) AS participantCount,
    COALESCE(e.room_uuid_count, 0) AS roomUuidCount,
    e.room_uuid AS roomUuid,
    ri.id AS roomInstanceId,
    rp.name AS programName,
    rp.title AS programTitle,
    rpv.version AS programVersion
  FROM matches m
  LEFT JOIN evidence e ON e.match_id = m.id
  LEFT JOIN room_instances ri
    ON e.room_uuid_count = 1
   AND ri.uuid = e.room_uuid
  LEFT JOIN room_programs rp ON rp.id = ri.program_id
  LEFT JOIN room_program_versions rpv ON rpv.id = ri.version_id
  WHERE m.room_instance_id IS NULL
  ORDER BY m.id ASC
`;
