import { enqueueClipRenditions } from "@/features/media-renditions/_shared/domain/jobs";
import {
  listClipRenditionBackfillCandidates,
  type ClipRenditionBackfillCandidate
} from "@/features/media-renditions/backfill";

const [command = "preview", expectedArgument] = Bun.argv.slice(2);

if (command !== "preview" && command !== "apply") {
  throw new Error("Use preview or apply <expected-candidate-count>");
}

const candidates = await listClipRenditionBackfillCandidates();

if (command === "preview") {
  printReport("preview", candidates);
} else {
  const expectedCandidates = Number(expectedArgument);
  if (!Number.isSafeInteger(expectedCandidates) || expectedCandidates < 0) {
    throw new Error(
      "Apply requires the expected non-negative candidate count from preview"
    );
  }
  if (expectedCandidates !== candidates.length) {
    throw new Error(
      `Candidate count changed: expected ${expectedCandidates}, found ${candidates.length}`
    );
  }

  for (const candidate of candidates) {
    await enqueueClipRenditions(candidate.clip, candidate.recording);
  }
  printReport("applied", candidates);
}

function printReport(
  mode: "preview" | "applied",
  candidates: ClipRenditionBackfillCandidate[]
): void {
  process.stdout.write(
    `${JSON.stringify(
      {
        mode,
        candidateCount: candidates.length,
        candidates: candidates.slice(0, 100).map(({ clip, recording }) => ({
          clipId: clip.publicId,
          recordingId: recording.publicId,
          startFrame: clip.startTick,
          endFrame: clip.endTick
        })),
        truncated: candidates.length > 100
      },
      null,
      2
    )}\n`
  );
}
