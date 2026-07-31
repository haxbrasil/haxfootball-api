import { Database } from "bun:sqlite";
import { configureSqlite } from "@/db/sqlite";

const [mode, databaseFile] = Bun.argv.slice(2);

if (!mode || !databaseFile) {
  throw new Error("Mode and database file are required");
}

const database = new Database(databaseFile);
configureSqlite(database);

try {
  if (mode === "hold") {
    database.exec("BEGIN IMMEDIATE");
    process.stdout.write("locked\n");
    await Bun.sleep(450);
    database.exec("COMMIT");
  } else if (mode === "write") {
    database.exec("INSERT INTO lock_probe DEFAULT VALUES");
  } else {
    throw new Error(`Unknown lock worker mode: ${mode}`);
  }
} finally {
  database.close();
}
