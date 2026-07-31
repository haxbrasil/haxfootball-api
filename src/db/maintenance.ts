import { Database } from "bun:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";

type ForeignKeyViolation = {
  table: string;
  rowid: number;
  parent: string;
  fkid: number;
};

export type SqliteVerification = {
  integrity: string;
  foreignKeyViolations: ForeignKeyViolation[];
};

export function verifySqliteFile(databaseFile: string): SqliteVerification {
  const database = new Database(databaseFile, { readonly: true });

  try {
    const integrityRow = database
      .query<Record<string, string>, []>("PRAGMA integrity_check")
      .get();
    const integrity = integrityRow
      ? (Object.values(integrityRow)[0] ?? "missing")
      : "missing";
    const foreignKeyViolations = database
      .query<ForeignKeyViolation, []>("PRAGMA foreign_key_check")
      .all();

    if (integrity !== "ok") {
      throw new Error(`SQLite integrity check failed: ${integrity}`);
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error(
        `SQLite foreign-key check found ${foreignKeyViolations.length} violation(s)`
      );
    }

    return { integrity, foreignKeyViolations };
  } finally {
    database.close();
  }
}

export function createSqliteBackup(input: {
  databaseFile: string;
  backupDirectory: string;
  sourceSha: string;
}): string {
  mkdirSync(input.backupDirectory, { recursive: true });
  const sourceSha = sanitizeFilePart(input.sourceSha).slice(0, 40) || "unknown";
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const backupFile = join(
    input.backupDirectory,
    `${basename(input.databaseFile)}.${timestamp}.${sourceSha}.sqlite`
  );
  const database = new Database(input.databaseFile);

  try {
    const checkpoint = database
      .query<{ busy: number; log: number; checkpointed: number }, []>(
        "PRAGMA wal_checkpoint(TRUNCATE)"
      )
      .get();

    if (checkpoint?.busy) {
      throw new Error("SQLite WAL checkpoint remained busy");
    }

    database.exec(`VACUUM INTO '${escapeSqliteString(backupFile)}'`);
  } finally {
    database.close();
  }

  verifySqliteFile(backupFile);
  writeFileSync(
    `${backupFile}.json`,
    `${JSON.stringify(
      {
        databaseFile: input.databaseFile,
        backupFile,
        sourceSha: input.sourceSha,
        createdAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  );

  return backupFile;
}

export function restoreSqliteBackup(input: {
  databaseFile: string;
  backupFile: string;
}): string {
  verifySqliteFile(input.backupFile);
  mkdirSync(dirname(input.databaseFile), { recursive: true });

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const failedFile = `${input.databaseFile}.failed-${timestamp}`;
  const restoreFile = `${input.databaseFile}.restore-${crypto.randomUUID()}`;

  checkpointSqliteFile(input.databaseFile);
  rmSync(`${input.databaseFile}-wal`, { force: true });
  rmSync(`${input.databaseFile}-shm`, { force: true });
  copyFileSync(input.backupFile, restoreFile);
  verifySqliteFile(restoreFile);

  try {
    renameSync(input.databaseFile, failedFile);
  } catch (error) {
    if (!isMissingFileError(error)) {
      rmSync(restoreFile, { force: true });
      throw error;
    }
  }

  renameSync(restoreFile, input.databaseFile);
  verifySqliteFile(input.databaseFile);

  return failedFile;
}

function checkpointSqliteFile(databaseFile: string): void {
  if (!existsSync(databaseFile)) {
    return;
  }

  const database = new Database(databaseFile);

  try {
    const checkpoint = database
      .query<{ busy: number; log: number; checkpointed: number }, []>(
        "PRAGMA wal_checkpoint(TRUNCATE)"
      )
      .get();

    if (checkpoint?.busy) {
      throw new Error("SQLite WAL checkpoint remained busy");
    }

    const journalMode = database
      .query<Record<string, string>, []>("PRAGMA journal_mode = DELETE")
      .get();
    const selectedMode = journalMode
      ? (Object.values(journalMode)[0] ?? "")
      : "";

    if (selectedMode.toLowerCase() !== "delete") {
      throw new Error(
        `SQLite could not prepare the displaced database: journal mode is ${selectedMode}`
      );
    }
  } finally {
    database.close();
  }
}

function escapeSqliteString(value: string): string {
  return value.replaceAll("'", "''");
}

function sanitizeFilePart(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, "-");
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
