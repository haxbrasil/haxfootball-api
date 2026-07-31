import { migrateSqlite } from "@/db/migrate";

const databaseFile = Bun.env.DATABASE_FILE ?? "data/app.sqlite";

migrateSqlite({ databaseFile });
process.stdout.write(`Migrated and verified ${databaseFile}\n`);
