import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createUniqueComposedMatchPublicId } from "@/features/matches/_shared/domain/public-id";
import { getComposedMatchRow } from "@/features/matches/_shared/db/queries";
import {
  matchCompositionRoundsBodySchema,
  type MatchCompositionRoundsInput
} from "@/features/matches/_shared/http/inputs";
import {
  toComposedMatchResponse,
  type ComposedMatchResponse
} from "@/features/matches/_shared/http/responses";
import { composedMatchRounds, composedMatches } from "@/features/matches/db";
import { resolveMatchCompositionRounds } from "@/features/matches/resolve-match-composition-rounds";
import { badRequest } from "@/shared/http/errors";

export { matchCompositionRoundsBodySchema as createMatchCompositionBodySchema };

export async function createMatchComposition(
  input: MatchCompositionRoundsInput
): Promise<ComposedMatchResponse> {
  const rounds = await resolveMatchCompositionRounds(input.rounds);
  const publicId = await createUniqueComposedMatchPublicId(publicIdExists);

  if (!publicId) {
    throw badRequest("Match public ID collision");
  }

  const firstMatch = rounds[0]?.match;

  if (!firstMatch) {
    throw new Error("Validated composition has no first match");
  }

  const composition = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(composedMatches)
      .values({
        publicId,
        firstMatchId: firstMatch.id
      })
      .returning();

    await tx.insert(composedMatchRounds).values(
      rounds.map((round, index) => ({
        composedMatchId: created.id,
        matchId: round.match.id,
        kind: round.input.kind,
        roundNumber: round.input.number,
        position: index + 1
      }))
    );

    return created;
  });

  return toComposedMatchResponse(await getComposedMatchRow(composition));
}

async function publicIdExists(publicId: string): Promise<boolean> {
  const [composition] = await db
    .select({ id: composedMatches.id })
    .from(composedMatches)
    .where(eq(composedMatches.publicId, publicId));

  return !!composition;
}
