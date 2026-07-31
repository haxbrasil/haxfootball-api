import { eq } from "drizzle-orm";
import { withDatabaseTransaction } from "@/db/client";
import { getComposedMatchByPublicId } from "@/features/matches/_shared/db/queries";
import { composedMatchRounds, composedMatches } from "@/features/matches/db";
import { assertCompositionUnclaimed } from "@/features/matches/evidence-claims";

export async function deleteMatchComposition(publicId: string): Promise<void> {
  const composition = await getComposedMatchByPublicId(publicId);

  await withDatabaseTransaction(async (tx) => {
    await assertCompositionUnclaimed(tx, composition.id);
    await tx
      .delete(composedMatchRounds)
      .where(eq(composedMatchRounds.composedMatchId, composition.id));
    await tx
      .delete(composedMatches)
      .where(eq(composedMatches.id, composition.id));
  });
}
