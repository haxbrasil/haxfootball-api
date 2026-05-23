import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import {
  type MatchScore,
  matchPlayerEventInputSchema,
  matchScoreSchema,
  matchStatusSchema
} from "@/features/matches/_shared/http/inputs";
import type { MatchResponse } from "@/features/matches/_shared/http/responses";
import { toMatchResponse } from "@/features/matches/_shared/http/responses";
import { matches } from "@/features/matches/db";
import {
  getMatchDetail,
  getMatchSummary,
  persistMatchScore,
  assertMatchGameModeCanChange,
  assertMatchStatEventSchemaCanChange,
  resolveMatchStatEventSchemaVersionId,
  recomputeMatchStints,
  replaceMatchEvents
} from "@/features/matches/_shared/db/queries";
import { statEventSchemaReferenceSchema } from "@/features/stat-event-schemas/http";
import { gameModeReferenceSchema } from "@/features/game-modes/http";
import { resolveGameModeId } from "@/features/game-modes/read-game-mode";
import {
  assertCompletedMatchFields,
  assertMatchIsEditable
} from "@/features/matches/_shared/domain/validation";

export const updateMatchBodySchema = t.Partial(
  t.Object({
    status: matchStatusSchema,
    initiatedAt: t.String({ minLength: 1 }),
    endedAt: t.String({ minLength: 1 }),
    score: matchScoreSchema,
    gameMode: gameModeReferenceSchema,
    statEventSchema: statEventSchemaReferenceSchema,
    events: t.Array(matchPlayerEventInputSchema)
  })
);

export type UpdateMatchInput = Static<typeof updateMatchBodySchema>;

export async function updateMatch(
  id: string,
  input: UpdateMatchInput
): Promise<MatchResponse> {
  const current = await getMatchSummary(id);

  assertMatchIsEditable(current.match);

  const nextStatus = input.status ?? current.match.status;
  const nextEndedAt = input.endedAt ?? current.match.endedAt;
  const nextScore = input.score ?? scoreFromMetadata(current.metadata);
  const nextGameModeId = await resolveGameModeId(input.gameMode);
  const nextStatEventSchemaVersionId =
    await resolveMatchStatEventSchemaVersionId(input.statEventSchema);

  assertCompletedMatchFields({
    status: nextStatus,
    endedAt: nextEndedAt,
    score: nextScore
  });

  if (
    nextStatEventSchemaVersionId !== undefined &&
    nextStatEventSchemaVersionId !== current.match.statEventSchemaVersionId
  ) {
    await assertMatchStatEventSchemaCanChange(current.match.id);
  }

  if (
    nextGameModeId !== undefined &&
    nextGameModeId !== current.match.gameModeId
  ) {
    await assertMatchGameModeCanChange(current.match.id);
  }

  await db
    .update(matches)
    .set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.initiatedAt !== undefined
        ? { initiatedAt: input.initiatedAt }
        : {}),
      ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
      ...(nextGameModeId !== undefined ? { gameModeId: nextGameModeId } : {}),
      ...(nextStatEventSchemaVersionId !== undefined
        ? { statEventSchemaVersionId: nextStatEventSchemaVersionId }
        : {}),
      updatedAt: new Date().toISOString()
    })
    .where(eq(matches.id, current.match.id));

  if (input.score !== undefined) {
    await persistMatchScore(current.match.id, input.score);
  }

  if (input.events !== undefined) {
    await replaceMatchEvents(current.match.id, input.events);
    await recomputeMatchStints(current.match.id);
  }

  return toMatchResponse(await getMatchDetail(id));
}

function scoreFromMetadata(
  metadata: Array<{ team: "red" | "blue"; score: number }>
): MatchScore | null {
  const red = metadata.find((item) => item.team === "red");
  const blue = metadata.find((item) => item.team === "blue");

  if (!red || !blue) {
    return null;
  }

  return {
    red: red.score,
    blue: blue.score
  };
}
