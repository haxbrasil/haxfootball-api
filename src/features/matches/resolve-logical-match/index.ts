import { asc, eq, or } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { toMatchRoundReference } from "@/features/matches/_shared/domain/composition";
import {
  composedMatchRounds,
  composedMatches,
  matches,
  type ComposedMatch,
  type Match
} from "@/features/matches/db";
import { matchPublicIdSchema } from "@/features/matches/_shared/http/inputs";
import { notFound } from "@/shared/http/errors";
export { logicalMatchPublicIdSchema } from "@/features/matches/_shared/http/inputs";

export const matchRoundReferenceSchema = t.Union([
  t.Object({
    kind: t.Literal("sequential"),
    number: t.Integer({ minimum: 1 }),
    matchId: matchPublicIdSchema,
    orientation: t.Union([t.Literal("aligned"), t.Literal("swapped")])
  }),
  t.Object({
    kind: t.Literal("extra-time"),
    number: t.Null(),
    matchId: matchPublicIdSchema,
    orientation: t.Union([t.Literal("aligned"), t.Literal("swapped")])
  })
]);

export type MatchRoundReference = Static<typeof matchRoundReferenceSchema>;

export type ResolvedLogicalMatch =
  | {
      kind: "single";
      publicId: string;
      anchorId: number;
      firstMatch: Match;
      lastMatch: Match;
      rounds: Array<{
        reference: {
          kind: "sequential";
          number: 1;
          matchId: string;
          orientation: "aligned";
        };
        match: Match;
      }>;
    }
  | {
      kind: "composed";
      publicId: string;
      anchorId: number;
      composition: ComposedMatch;
      firstMatch: Match;
      lastMatch: Match;
      rounds: Array<{
        reference: MatchRoundReference;
        match: Match;
      }>;
    };

export async function resolveLogicalMatch(
  publicId: string
): Promise<ResolvedLogicalMatch> {
  const [compositionRow] = await db
    .select({ composition: composedMatches })
    .from(composedMatches)
    .leftJoin(
      composedMatchRounds,
      eq(composedMatchRounds.composedMatchId, composedMatches.id)
    )
    .leftJoin(matches, eq(composedMatchRounds.matchId, matches.id))
    .where(
      or(eq(composedMatches.publicId, publicId), eq(matches.publicId, publicId))
    );

  if (compositionRow) {
    const rows = await db
      .select({ round: composedMatchRounds, match: matches })
      .from(composedMatchRounds)
      .innerJoin(matches, eq(composedMatchRounds.matchId, matches.id))
      .where(
        eq(composedMatchRounds.composedMatchId, compositionRow.composition.id)
      )
      .orderBy(asc(composedMatchRounds.position));
    const rounds = rows.map(({ round, match }) => ({
      reference: toMatchRoundReference(round, match.publicId),
      match
    }));
    const firstRound = rounds[0];
    const lastRound = rounds.at(-1);

    if (!firstRound || !lastRound) {
      throw new Error("Composed match has no persisted rounds");
    }

    return {
      kind: "composed",
      publicId: compositionRow.composition.publicId,
      anchorId: firstRound.match.id,
      composition: compositionRow.composition,
      firstMatch: firstRound.match,
      lastMatch: lastRound.match,
      rounds
    };
  }

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.publicId, publicId));

  if (!match) {
    throw notFound("Match not found");
  }

  return {
    kind: "single",
    publicId: match.publicId,
    anchorId: match.id,
    firstMatch: match,
    lastMatch: match,
    rounds: [
      {
        reference: {
          kind: "sequential",
          number: 1,
          matchId: match.publicId,
          orientation: "aligned"
        },
        match
      }
    ]
  };
}
