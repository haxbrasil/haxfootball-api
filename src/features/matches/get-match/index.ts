import {
  type MatchResponse,
  toComposedMatchResponse,
  toMatchResponse
} from "@/features/matches/_shared/http/responses";
import {
  getComposedMatchRow,
  getMatchDetail
} from "@/features/matches/_shared/db/queries";
import { resolveLogicalMatch } from "@/features/matches/resolve-logical-match";

export async function getMatch(id: string): Promise<MatchResponse> {
  const logicalMatch = await resolveLogicalMatch(id);

  if (logicalMatch.kind === "composed") {
    return toComposedMatchResponse(
      await getComposedMatchRow(logicalMatch.composition)
    );
  }

  return toMatchResponse(await getMatchDetail(logicalMatch.publicId));
}
