import {
  type MatchResponse,
  toMatchResponse
} from "@/features/matches/match.contract";
import { getMatchDetail } from "@/features/matches/match.persistence";

export async function getMatch(id: string): Promise<MatchResponse> {
  return toMatchResponse(await getMatchDetail(id));
}
