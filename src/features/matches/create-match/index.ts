import { type Static, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  matchPlayerEventInputSchema,
  matchScoreSchema,
  matchStatusSchema
} from "@/features/matches/_shared/http/inputs";
import type { MatchResponse } from "@/features/matches/_shared/http/responses";
import {
  matchResponseSchema,
  toMatchResponse
} from "@/features/matches/_shared/http/responses";
import { matches } from "@/features/matches/db";
import { createUniqueMatchPublicId } from "@/features/matches/_shared/domain/public-id";
import {
  getMatchDetail,
  getRecordingForAssociation,
  persistResolvedMatchEvents,
  persistMatchScore,
  resolveMatchEvents,
  resolveMatchStatEventSchemaVersionId,
  recomputeMatchStints
} from "@/features/matches/_shared/db/queries";
import { gameModeReferenceSchema } from "@/features/game-modes/http";
import { resolveGameModeId } from "@/features/game-modes/read-game-mode";
import { assertCompletedMatchFields } from "@/features/matches/_shared/domain/validation";
import { statEventSchemaReferenceSchema } from "@/features/stat-event-schemas/http";
import { badRequest } from "@/shared/http/errors";

export const createMatchBodySchema = t.Object({
  status: matchStatusSchema,
  initiatedAt: t.Optional(t.String({ minLength: 1 })),
  endedAt: t.Optional(t.String({ minLength: 1 })),
  score: t.Optional(matchScoreSchema),
  recordingId: t.Optional(t.String({ minLength: 1 })),
  gameMode: t.Optional(gameModeReferenceSchema),
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
  const gameModeId = await resolveGameModeId(input.gameMode);
  const statEventSchemaVersionId = await resolveMatchStatEventSchemaVersionId(
    input.statEventSchema
  );
  const initialEvents = input.events ?? [];
  const persistedInitialEvents = await resolveMatchEvents(initialEvents, 1);
  const matchValues = {
    publicId,
    status: input.status,
    recordingId,
    gameModeId,
    statEventSchemaVersionId,
    initiatedAt: input.initiatedAt,
    endedAt: input.endedAt
  };

  const createdMatch = await db.transaction(async (tx) => {
    const [match] = await tx.insert(matches).values(matchValues).returning();

    await persistMatchScore(match.id, input.score, tx);
    await persistResolvedMatchEvents(match.id, persistedInitialEvents, tx);
    await recomputeMatchStints(match.id, tx);

    return match;
  });

  const matchDetail = await getMatchDetail(createdMatch.publicId);

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
