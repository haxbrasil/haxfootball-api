import { eq } from "drizzle-orm";
import {
  db,
  type DatabaseExecutor,
  type DbTransaction,
  withDatabaseTransaction
} from "@/db/client";
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
  const composition = await withDatabaseTransaction((tx) =>
    createMatchCompositionInTransaction(input, tx)
  );

  return toComposedMatchResponse(await getComposedMatchRow(composition));
}

export async function createMatchCompositionInTransaction(
  input: MatchCompositionRoundsInput,
  tx: DbTransaction
) {
  const scoreMode = input.scoreMode ?? "cumulative";
  const rounds = await resolveMatchCompositionRounds(
    input.rounds,
    scoreMode,
    undefined,
    tx
  );
  const publicId = await createUniqueComposedMatchPublicId((candidate) =>
    publicIdExists(candidate, tx)
  );

  if (!publicId) {
    throw badRequest("Match public ID collision");
  }

  const firstMatch = rounds[0]?.match;

  if (!firstMatch) {
    throw new Error("Validated composition has no first match");
  }

  const [created] = await tx
    .insert(composedMatches)
    .values({
      publicId,
      scoreMode,
      firstMatchId: firstMatch.id
    })
    .returning();

  await tx.insert(composedMatchRounds).values(
    rounds.map((round, index) => ({
      composedMatchId: created.id,
      matchId: round.match.id,
      kind: round.input.kind,
      roundNumber: round.input.number,
      teamOrientation: round.teamOrientation,
      position: index + 1
    }))
  );

  return created;
}

async function publicIdExists(
  publicId: string,
  database: DatabaseExecutor = db
): Promise<boolean> {
  const [composition] = await database
    .select({ id: composedMatches.id })
    .from(composedMatches)
    .where(eq(composedMatches.publicId, publicId));

  return !!composition;
}
