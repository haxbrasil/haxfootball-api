import {
  createSqliteBackup,
  restoreSqliteBackup,
  verifySqliteFile
} from "@/db/maintenance";

const [command, argument] = Bun.argv.slice(2);
const databaseFile = Bun.env.DATABASE_FILE;

if (!databaseFile) {
  throw new Error("DATABASE_FILE is required");
}

switch (command) {
  case "backup": {
    const backupDirectory =
      argument ?? Bun.env.DATABASE_BACKUP_DIRECTORY ?? "data/backups";
    const backupFile = createSqliteBackup({
      databaseFile,
      backupDirectory,
      sourceSha: Bun.env.DEPLOY_SOURCE_SHA ?? "unknown"
    });

    process.stdout.write(`${backupFile}\n`);
    break;
  }
  case "restore": {
    if (!argument) {
      throw new Error("Backup file argument is required for restore");
    }

    const failedFile = restoreSqliteBackup({
      databaseFile,
      backupFile: argument
    });
    process.stdout.write(`${failedFile}\n`);
    break;
  }
  case "verify": {
    const result = verifySqliteFile(argument ?? databaseFile);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    break;
  }
  default:
    throw new Error("Use backup, restore <file>, or verify [file]");
}
