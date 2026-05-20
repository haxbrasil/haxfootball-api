import {
  type MatchResponse,
  toMatchResponse
} from "@/features/matches/_shared/http/responses";
import { getMatchDetail } from "@/features/matches/_shared/db/queries";

export async function getMatch(id: string): Promise<MatchResponse> {
  return toMatchResponse(await getMatchDetail(id));
}
