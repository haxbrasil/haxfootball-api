import { and, eq, or } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/client";
import { championshipSpots } from "@/features/championships/format-scheduling/db";
import { championshipPlacements } from "@/features/championships/history/db";
import { championshipTeams } from "@/features/championships/people/db";

type PlacementSource = "format" | "staff" | "historical-import";

export async function syncPlacementSpot(
  database: DatabaseExecutor,
  spot: typeof championshipSpots.$inferSelect,
  teamId: number | null,
  source: PlacementSource,
  awardedByAccountId: number | null = null
): Promise<void> {
  if (spot.kind !== "placement" || spot.placementRank === null) return;

  if (teamId === null) {
    await database
      .delete(championshipPlacements)
      .where(
        and(
          eq(championshipPlacements.championshipId, spot.championshipId),
          eq(championshipPlacements.rank, spot.placementRank)
        )
      );
    return;
  }

  const [team] = await database
    .select()
    .from(championshipTeams)
    .where(
      and(
        eq(championshipTeams.id, teamId),
        eq(championshipTeams.championshipId, spot.championshipId)
      )
    );

  if (!team) {
    throw new Error("Placement spot team does not belong to its championship");
  }

  await database
    .delete(championshipPlacements)
    .where(
      and(
        eq(championshipPlacements.championshipId, spot.championshipId),
        or(
          eq(championshipPlacements.rank, spot.placementRank),
          eq(championshipPlacements.teamId, team.id)
        )
      )
    );
  await database.insert(championshipPlacements).values({
    championshipId: spot.championshipId,
    teamId: team.id,
    rank: spot.placementRank,
    teamIdentityIdSnapshot: team.teamIdentityId,
    teamNameSnapshot: team.name,
    source,
    awardedByAccountId
  });
}
