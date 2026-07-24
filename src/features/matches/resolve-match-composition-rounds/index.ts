import { and, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  resolveRoundTeamOrientations,
  validateMatchCompositionRounds
} from "@/features/matches/_shared/domain/composition";
import type { MatchRoundInput } from "@/features/matches/_shared/http/inputs";
import {
  composedMatchRounds,
  composedMatches,
  matches,
  matchPlayerStints,
  matchTeamMetadata,
  type Match
} from "@/features/matches/db";
import { badRequest, notFound } from "@/shared/http/errors";

export type ResolvedCompositionRound = {
  input: MatchRoundInput;
  match: Match;
  score: { red: number; blue: number };
  teamOrientation: "aligned" | "swapped";
};

export async function resolveMatchCompositionRounds(
  inputs: MatchRoundInput[],
  currentCompositionId?: number
): Promise<ResolvedCompositionRound[]> {
  const publicIds = inputs.map((round) => round.matchId);
  const physicalMatches = await db
    .select()
    .from(matches)
    .where(inArray(matches.publicId, publicIds));
  const matchByPublicId = new Map(
    physicalMatches.map((match) => [match.publicId, match])
  );
  const missingPublicIds = publicIds.filter(
    (publicId) => !matchByPublicId.has(publicId)
  );

  if (missingPublicIds.length > 0) {
    const [nestedComposition] = await db
      .select({ id: composedMatches.id })
      .from(composedMatches)
      .where(inArray(composedMatches.publicId, missingPublicIds));

    if (nestedComposition) {
      throw badRequest("Composed matches cannot be used as rounds");
    }

    throw notFound("Physical match not found");
  }

  validateMatchCompositionRounds(inputs, matchByPublicId);

  const membershipConditions = [
    inArray(
      composedMatchRounds.matchId,
      physicalMatches.map((match) => match.id)
    )
  ];

  if (currentCompositionId !== undefined) {
    membershipConditions.push(
      ne(composedMatchRounds.composedMatchId, currentCompositionId)
    );
  }

  const [existingMembership] = await db
    .select({ matchId: composedMatchRounds.matchId })
    .from(composedMatchRounds)
    .where(and(...membershipConditions))
    .limit(1);

  if (existingMembership) {
    throw badRequest("Match is already bound to a composed match");
  }

  const metadata = await db
    .select()
    .from(matchTeamMetadata)
    .where(
      inArray(
        matchTeamMetadata.matchId,
        physicalMatches.map((match) => match.id)
      )
    );
  const metadataByMatchId = new Map<number, typeof metadata>();

  for (const item of metadata) {
    const matchMetadata = metadataByMatchId.get(item.matchId) ?? [];

    matchMetadata.push(item);
    metadataByMatchId.set(item.matchId, matchMetadata);
  }

  const stints = await db
    .select({
      matchId: matchPlayerStints.matchId,
      playerId: matchPlayerStints.playerId,
      team: matchPlayerStints.team
    })
    .from(matchPlayerStints)
    .where(
      inArray(
        matchPlayerStints.matchId,
        physicalMatches.map((match) => match.id)
      )
    );
  const playersByMatchId = new Map<
    number,
    { red: Set<number>; blue: Set<number> }
  >();

  for (const stint of stints) {
    const players = playersByMatchId.get(stint.matchId) ?? {
      red: new Set<number>(),
      blue: new Set<number>()
    };

    players[stint.team].add(stint.playerId);
    playersByMatchId.set(stint.matchId, players);
  }

  const unresolvedRounds = inputs.map((input) => {
    const match = matchByPublicId.get(input.matchId);

    if (!match) {
      throw new Error("Resolved composition round is missing its match");
    }

    const matchMetadata = metadataByMatchId.get(match.id) ?? [];
    const red = matchMetadata.find((item) => item.team === "red");
    const blue = matchMetadata.find((item) => item.team === "blue");

    if (!red || !blue) {
      throw badRequest("Completed rounds must include a score");
    }

    return {
      input,
      match,
      score: { red: red.score, blue: blue.score },
      players: playersByMatchId.get(match.id) ?? {
        red: new Set<number>(),
        blue: new Set<number>()
      }
    };
  });

  const orientations = resolveRoundTeamOrientations(
    unresolvedRounds.map((round) => ({
      requested: round.input.orientation ?? "auto",
      score: round.score,
      players: round.players
    }))
  );
  const resolvedRounds = unresolvedRounds.map((round, index) => {
    const teamOrientation = orientations[index];

    if (!teamOrientation) {
      throw new Error("Resolved composition round has no team orientation");
    }

    return {
      input: round.input,
      match: round.match,
      score: round.score,
      teamOrientation
    };
  });

  return resolvedRounds;
}
