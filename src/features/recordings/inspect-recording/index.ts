import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { recordingInspections } from "@/features/matches/evidence-db";
import { recordings } from "@/features/recordings/db";
import { toRecordingResponse } from "@/features/recordings/_shared/http/responses";
import { notFound } from "@/shared/http/errors";
import { inspectRecordingBytes } from "@/features/recordings/inspect-recording/inspection";

export { inspectRecordingBytes } from "@/features/recordings/inspect-recording/inspection";

const decoderVersion = "1.0.3";

export const recordingInspectionResponseSchema = t.Object({
  recordingId: t.String(),
  state: t.Union([
    t.Literal("unchecked"),
    t.Literal("playable"),
    t.Literal("invalid"),
    t.Literal("unsupported")
  ]),
  profile: t.Nullable(t.Union([t.Literal("structural"), t.Literal("strict")])),
  issues: t.Array(
    t.Object({
      code: t.String(),
      severity: t.Union([t.Literal("error"), t.Literal("warning")]),
      path: t.String(),
      message: t.String()
    })
  ),
  decoderVersion: t.Nullable(t.String()),
  checkedAt: t.Nullable(t.String())
});

export type RecordingInspectionResponse = Static<
  typeof recordingInspectionResponseSchema
>;

export async function getRecordingInspection(
  publicId: string
): Promise<RecordingInspectionResponse> {
  const { recording, inspection } = await readInspection(publicId);

  return inspection
    ? {
        recordingId: recording.publicId,
        state: inspection.state,
        profile: inspection.profile,
        issues: inspection.issues,
        decoderVersion: inspection.decoderVersion,
        checkedAt: inspection.checkedAt
      }
    : unchecked(recording.publicId);
}

export async function inspectRecording(
  publicId: string
): Promise<RecordingInspectionResponse> {
  const { recording } = await readInspection(publicId);
  let response: Response;

  try {
    response = await fetch(toRecordingResponse(recording).url, {
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    return persistInspection(recording, "invalid", [
      {
        code: "recording-fetch-failed",
        severity: "error",
        path: "$",
        message:
          error instanceof Error
            ? error.message
            : "Recording object could not be fetched"
      }
    ]);
  }

  if (!response.ok) {
    const issue = {
      code: "recording-fetch-failed",
      severity: "error" as const,
      path: "$",
      message: `Recording object returned HTTP ${response.status}`
    };

    return persistInspection(recording, "invalid", [issue]);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const inspection = await inspectRecordingBytes(bytes);

  return persistInspection(recording, inspection.state, inspection.issues);
}

async function readInspection(publicId: string) {
  const [row] = await db
    .select({ recording: recordings, inspection: recordingInspections })
    .from(recordings)
    .leftJoin(
      recordingInspections,
      eq(recordings.id, recordingInspections.recordingId)
    )
    .where(eq(recordings.publicId, publicId));

  if (!row) {
    throw notFound("Recording not found");
  }

  return row;
}

async function persistInspection(
  recording: typeof recordings.$inferSelect,
  state: "playable" | "invalid" | "unsupported",
  issues: Array<{
    code: string;
    severity: "error" | "warning";
    path: string;
    message: string;
  }>
) {
  const now = new Date().toISOString();
  const [inspection] = await db
    .insert(recordingInspections)
    .values({
      recordingId: recording.id,
      state,
      profile: "structural",
      issues,
      decoderVersion,
      checkedAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: recordingInspections.recordingId,
      set: {
        state,
        profile: "structural",
        issues,
        decoderVersion,
        checkedAt: now,
        updatedAt: now
      }
    })
    .returning();

  return {
    recordingId: recording.publicId,
    state: inspection.state,
    profile: inspection.profile,
    issues: inspection.issues,
    decoderVersion: inspection.decoderVersion,
    checkedAt: inspection.checkedAt
  };
}

function unchecked(recordingId: string): RecordingInspectionResponse {
  return {
    recordingId,
    state: "unchecked",
    profile: null,
    issues: [],
    decoderVersion: null,
    checkedAt: null
  };
}
