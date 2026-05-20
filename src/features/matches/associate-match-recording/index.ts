import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import type { MatchResponse } from "@/features/matches/_shared/http/responses";
import { toMatchResponse } from "@/features/matches/_shared/http/responses";
import { matches } from "@/features/matches/db";
import {
  getMatchDetail,
  getMatchSummary,
  getRecordingForAssociation
} from "@/features/matches/_shared/db/queries";
import { badRequest } from "@/shared/http/errors";

export const associateMatchRecordingBodySchema = t.Object({
  recordingId: t.String({ minLength: 1 })
});

export type AssociateMatchRecordingInput = Static<
  typeof associateMatchRecordingBodySchema
>;

export async function associateMatchRecording(
  id: string,
  input: AssociateMatchRecordingInput
): Promise<MatchResponse> {
  const current = await getMatchSummary(id);

  if (current.match.recordingId !== null) {
    throw badRequest("Match already has a recording");
  }

  const recording = await getRecordingForAssociation(input.recordingId);

  await db
    .update(matches)
    .set({
      recordingId: recording.id,
      updatedAt: new Date().toISOString()
    })
    .where(eq(matches.id, current.match.id));

  return toMatchResponse(await getMatchDetail(id));
}
