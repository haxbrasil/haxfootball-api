import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { getComposedMatchByPublicId } from "@/features/matches/_shared/db/queries";
import { composedMatchRounds, composedMatches } from "@/features/matches/db";

export async function deleteMatchComposition(publicId: string): Promise<void> {
  const composition = await getComposedMatchByPublicId(publicId);

  await db.transaction(async (tx) => {
    await tx
      .delete(composedMatchRounds)
      .where(eq(composedMatchRounds.composedMatchId, composition.id));
    await tx
      .delete(composedMatches)
      .where(eq(composedMatches.id, composition.id));
  });
}
