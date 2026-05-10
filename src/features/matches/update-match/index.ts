import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import {
  type MatchResponse,
  type MatchScore,
  matchPlayerEventInputSchema,
  matchScoreSchema,
  matchStatusSchema,
  toMatchResponse
} from "@/features/matches/match.contract";
import { matches } from "@/features/matches/match.db";
import {
  getMatchDetail,
  getMatchSummary,
  persistMatchScore,
  assertMatchStatEventSchemaCanChange,
  resolveMatchStatEventSchemaVersionId,
  recomputeMatchStints,
  replaceMatchEvents
} from "@/features/matches/match.persistence";
import { statEventSchemaReferenceSchema } from "@/features/stat-event-schemas/stat-event-schema.contract";
import {
  assertCompletedMatchFields,
  assertMatchIsEditable
} from "@/features/matches/match.invariants";

export const updateMatchBodySchema = t.Partial(
  t.Object({
    status: matchStatusSchema,
    initiatedAt: t.String({ minLength: 1 }),
    endedAt: t.String({ minLength: 1 }),
    score: matchScoreSchema,
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

  await db
    .update(matches)
    .set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.initiatedAt !== undefined
        ? { initiatedAt: input.initiatedAt }
        : {}),
      ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
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
