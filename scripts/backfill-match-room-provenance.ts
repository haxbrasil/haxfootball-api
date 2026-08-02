import {
  applyMatchRoomProvenanceBackfill,
  openMatchRoomProvenanceDatabase,
  previewMatchRoomProvenanceBackfill,
  type MatchRoomProvenancePreview
} from "@/features/matches/room-provenance-backfill";

const [command = "preview", expectedArgument] = Bun.argv.slice(2);
const databaseFile = Bun.env.DATABASE_FILE;

if (!databaseFile) {
  throw new Error("DATABASE_FILE is required");
}

if (command !== "preview" && command !== "apply") {
  throw new Error("Use preview or apply <expected-candidate-count>");
}

const database = openMatchRoomProvenanceDatabase(databaseFile);

try {
  if (command === "preview") {
    printReport("preview", previewMatchRoomProvenanceBackfill(database));
  } else {
    const expectedCandidates = Number(expectedArgument);

    if (!Number.isSafeInteger(expectedCandidates) || expectedCandidates < 0) {
      throw new Error(
        "Apply requires the expected non-negative candidate count from preview"
      );
    }

    printReport(
      "applied",
      applyMatchRoomProvenanceBackfill({ database, expectedCandidates })
    );
  }
} finally {
  database.close();
}

function printReport(
  mode: "preview" | "applied",
  report: MatchRoomProvenancePreview
): void {
  process.stdout.write(
    `${JSON.stringify(
      {
        mode,
        missingProvenance: report.missingProvenance,
        candidateCount: report.candidates.length,
        exclusionCount: report.exclusions.length,
        candidates: report.candidates,
        exclusions: report.exclusions
      },
      null,
      2
    )}\n`
  );
}
