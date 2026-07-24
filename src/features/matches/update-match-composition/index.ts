import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  getComposedMatchByPublicId,
  getComposedMatchRow
} from "@/features/matches/_shared/db/queries";
import type { MatchCompositionRoundsInput } from "@/features/matches/_shared/http/inputs";
import {
  toComposedMatchResponse,
  type ComposedMatchResponse
} from "@/features/matches/_shared/http/responses";
import { composedMatchRounds, composedMatches } from "@/features/matches/db";
import { resolveMatchCompositionRounds } from "@/features/matches/resolve-match-composition-rounds";

export async function updateMatchComposition(
  publicId: string,
  input: MatchCompositionRoundsInput
): Promise<ComposedMatchResponse> {
  const composition = await getComposedMatchByPublicId(publicId);
  const rounds = await resolveMatchCompositionRounds(
    input.rounds,
    composition.id
  );
  const firstMatch = rounds[0]?.match;

  if (!firstMatch) {
    throw new Error("Validated composition has no first match");
  }

  const updatedAt = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx
      .delete(composedMatchRounds)
      .where(eq(composedMatchRounds.composedMatchId, composition.id));
    await tx
      .update(composedMatches)
      .set({ firstMatchId: firstMatch.id, updatedAt })
      .where(eq(composedMatches.id, composition.id));
    await tx.insert(composedMatchRounds).values(
      rounds.map((round, index) => ({
        composedMatchId: composition.id,
        matchId: round.match.id,
        kind: round.input.kind,
        roundNumber: round.input.number,
        teamOrientation: round.teamOrientation,
        position: index + 1
      }))
    );
  });

  return toComposedMatchResponse(
    await getComposedMatchRow({
      ...composition,
      firstMatchId: firstMatch.id,
      updatedAt
    })
  );
}
