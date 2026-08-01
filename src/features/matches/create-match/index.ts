import { type Static, t } from "elysia";
import { eq } from "drizzle-orm";
import { db, withDatabaseTransaction } from "@/db/client";
import {
  matchEventInputSchema,
  matchScoreSchema,
  matchStatusSchema
} from "@/features/matches/_shared/http/inputs";
import type { PhysicalMatchResponse } from "@/features/matches/_shared/http/responses";
import {
  physicalMatchResponseSchema,
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
  resolveMatchEventSchemaVersionId,
  recomputeMatchStints
} from "@/features/matches/_shared/db/queries";
import { gameModeReferenceSchema } from "@/features/game-modes/http";
import { resolveGameModeId } from "@/features/game-modes/read-game-mode";
import { assertCompletedMatchFields } from "@/features/matches/_shared/domain/validation";
import { eventSchemaReferenceSchema } from "@/features/event-schemas/http";
import { badRequest } from "@/shared/http/errors";
import { roomInstances } from "@/features/rooms/db";
import { assertGameModeSchemaCompatible } from "@/features/game-modes/schema-compatibility";

export const createMatchBodySchema = t.Object({
  status: matchStatusSchema,
  sessionId: t.Optional(t.String({ format: "uuid" })),
  roomId: t.Optional(t.String({ format: "uuid" })),
  initiatedAt: t.Optional(t.String({ minLength: 1 })),
  endedAt: t.Optional(t.String({ minLength: 1 })),
  score: t.Optional(matchScoreSchema),
  recordingId: t.Optional(t.String({ minLength: 1 })),
  gameMode: t.Optional(gameModeReferenceSchema),
  eventSchema: t.Optional(eventSchemaReferenceSchema),
  events: t.Optional(t.Array(matchEventInputSchema))
});

export { physicalMatchResponseSchema as createMatchResponseSchema };

export type CreateMatchInput = Static<typeof createMatchBodySchema>;

export async function createMatch(
  input: CreateMatchInput
): Promise<PhysicalMatchResponse> {
  assertCompletedMatchFields(input);

  if (input.sessionId) {
    const [existing] = await db
      .select({ publicId: matches.publicId })
      .from(matches)
      .where(eq(matches.sessionId, input.sessionId));

    if (existing) {
      return toMatchResponse(await getMatchDetail(existing.publicId));
    }
  }

  const roomInstanceId = input.roomId
    ? await resolveRoomInstanceId(input.roomId)
    : null;
  const publicId = await createRequiredMatchPublicId();
  const recording = input.recordingId
    ? await getRecordingForAssociation(input.recordingId)
    : null;
  const recordingId = recording?.id;
  const gameModeId = await resolveGameModeId(input.gameMode);
  const eventSchemaVersionId = await resolveMatchEventSchemaVersionId(
    input.eventSchema
  );
  await assertGameModeSchemaCompatible(gameModeId, eventSchemaVersionId);
  const initialEvents = input.events ?? [];
  const persistedInitialEvents = await resolveMatchEvents(initialEvents, 1);
  const matchValues = {
    publicId,
    status: input.status,
    sessionId: input.sessionId,
    roomInstanceId,
    recordingId,
    gameModeId,
    eventSchemaVersionId,
    initiatedAt: input.initiatedAt,
    endedAt: input.endedAt
  };

  const createdMatch = await withDatabaseTransaction(async (tx) => {
    const [match] = await tx.insert(matches).values(matchValues).returning();

    await persistMatchScore(match.id, input.score, tx);
    await persistResolvedMatchEvents(match.id, persistedInitialEvents, tx);
    await recomputeMatchStints(match.id, tx);

    return match;
  });

  const matchDetail = await getMatchDetail(createdMatch.publicId);

  return toMatchResponse(matchDetail);
}

async function resolveRoomInstanceId(roomId: string): Promise<number> {
  const [room] = await db
    .select({ id: roomInstances.id })
    .from(roomInstances)
    .where(eq(roomInstances.uuid, roomId));

  if (!room) {
    throw badRequest("Room instance not found");
  }

  return room.id;
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
