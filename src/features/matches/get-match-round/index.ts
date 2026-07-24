import { t } from "elysia";
import { getMatchDetail } from "@/features/matches/_shared/db/queries";
import { composedMatchPublicIdSchema } from "@/features/matches/_shared/http/inputs";
import {
  toMatchResponse,
  type MatchRoundResponse
} from "@/features/matches/_shared/http/responses";
import { resolveLogicalMatch } from "@/features/matches/resolve-logical-match";
import { notFound } from "@/shared/http/errors";

export const matchRoundParamsSchema = t.Object({
  id: composedMatchPublicIdSchema,
  roundNumber: t.Numeric({ minimum: 1 })
});

export const matchExtraTimeParamsSchema = t.Object({
  id: composedMatchPublicIdSchema
});

export async function getSequentialMatchRound(
  publicId: string,
  roundNumber: number
): Promise<MatchRoundResponse> {
  return getMatchRound(publicId, "sequential", roundNumber);
}

export async function getExtraTimeMatchRound(
  publicId: string
): Promise<MatchRoundResponse> {
  return getMatchRound(publicId, "extra-time", null);
}

async function getMatchRound(
  publicId: string,
  kind: "sequential" | "extra-time",
  roundNumber: number | null
): Promise<MatchRoundResponse> {
  const logicalMatch = await resolveLogicalMatch(publicId);
  const row = logicalMatch.rounds.find(
    (round) =>
      round.reference.kind === kind && round.reference.number === roundNumber
  );

  if (!row) {
    throw notFound("Match round not found");
  }

  return {
    ...row.reference,
    match: toMatchResponse(await getMatchDetail(row.match.publicId))
  };
}
