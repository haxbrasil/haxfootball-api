import { type Static, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  type MatchResponse,
  matchPlayerEventInputSchema,
  matchResponseSchema,
  matchScoreSchema,
  matchStatusSchema,
  toMatchResponse
} from "@/features/matches/match.contract";
import { matches } from "@/features/matches/match.db";
import { createUniqueMatchPublicId } from "@/features/matches/match-public-id.util";
import {
  getMatchDetail,
  getRecordingForAssociation,
  persistMatchEvents,
  persistMatchScore,
  resolveMatchStatEventSchemaVersionId,
  recomputeMatchStints
} from "@/features/matches/match.persistence";
import { assertCompletedMatchFields } from "@/features/matches/match.service";
import { statEventSchemaReferenceSchema } from "@/features/stat-event-schemas/stat-event-schema.contract";
import { badRequest } from "@/shared/http/errors";

export const createMatchBodySchema = t.Object({
  status: matchStatusSchema,
  initiatedAt: t.Optional(t.String({ minLength: 1 })),
  endedAt: t.Optional(t.String({ minLength: 1 })),
  score: t.Optional(matchScoreSchema),
  recordingId: t.Optional(t.String({ minLength: 1 })),
  statEventSchema: t.Optional(statEventSchemaReferenceSchema),
  events: t.Optional(t.Array(matchPlayerEventInputSchema))
});

export { matchResponseSchema as createMatchResponseSchema };

export type CreateMatchInput = Static<typeof createMatchBodySchema>;

export async function createMatch(
  input: CreateMatchInput
): Promise<MatchResponse> {
  assertCompletedMatchFields(input);

  const publicId = await createRequiredMatchPublicId();
  const recording = input.recordingId
    ? await getRecordingForAssociation(input.recordingId)
    : null;
  const recordingId = recording?.id;
  const statEventSchemaVersionId = await resolveMatchStatEventSchemaVersionId(
    input.statEventSchema
  );
  const initialEvents = input.events ?? [];
  const matchValues = {
    publicId,
    status: input.status,
    recordingId,
    statEventSchemaVersionId,
    initiatedAt: input.initiatedAt,
    endedAt: input.endedAt
  };

  const [match] = await db.insert(matches).values(matchValues).returning();

  await persistMatchScore(match.id, input.score);
  await persistMatchEvents(match.id, initialEvents);
  await recomputeMatchStints(match.id);

  const matchDetail = await getMatchDetail(match.publicId);

  return toMatchResponse(matchDetail);
}

async function createRequiredMatchPublicId(): Promise<string> {
  const publicId = await createUniqueMatchPublicId(matchPublicIdExists);

  if (!publicId) {
    throw badRequest("Match public ID collision");
  }

  return publicId;
}

async function matchPublicIdExists(publicId: string): Promise<boolean> {
  const [existingMatch] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.publicId, publicId));

  const exists = !!existingMatch;

  return exists;
}
