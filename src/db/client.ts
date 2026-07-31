import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "@/config/env";
import * as schema from "@/db/schema";
import { configureSqlite } from "@/db/sqlite";

mkdirSync(dirname(env.databaseFile), { recursive: true });

const sqlite = new Database(env.databaseFile);

configureSqlite(sqlite);
assertSqliteJsonSupport(sqlite);

export const db = drizzle(sqlite, { schema });

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DatabaseExecutor = typeof db | DbTransaction;

let transactionTail = Promise.resolve();

export async function withDatabaseTransaction<T>(
  operation: (transaction: DbTransaction) => Promise<T>
): Promise<T> {
  let releaseTransaction!: () => void;
  const previousTransaction = transactionTail;

  transactionTail = new Promise<void>((resolve) => {
    releaseTransaction = resolve;
  });
  await previousTransaction;

  let transactionSqlite: Database | undefined;
  let transactionStarted = false;

  try {
    transactionSqlite = new Database(env.databaseFile);
    configureSqlite(transactionSqlite);
    assertSqliteJsonSupport(transactionSqlite);
    transactionSqlite.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    const transactionDb = drizzle(transactionSqlite, { schema });
    const result = await operation(transactionDb as unknown as DbTransaction);

    transactionSqlite.exec("COMMIT");

    return result;
  } catch (error) {
    if (transactionStarted) {
      transactionSqlite?.exec("ROLLBACK");
    }

    throw error;
  } finally {
    transactionSqlite?.close();
    releaseTransaction();
  }
}

type JsonSupportCheckRow = {
  jsonIsValid: number;
};

function assertSqliteJsonSupport(sqlite: Database): void {
  const validJson = '{"ok":true}';
  const jsonSupportCheck = sqlite
    .query<JsonSupportCheckRow, [string]>("select json_valid(?) as jsonIsValid")
    .get(validJson);

  if (jsonSupportCheck?.jsonIsValid !== 1) {
    throw new Error("SQLite JSON support is required");
  }
}
