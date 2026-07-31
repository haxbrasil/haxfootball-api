import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/client";
import {
  championshipMatches,
  championshipProgressionRoutes,
  championshipSpots
} from "@/features/championships/format-scheduling/db";
import { syncPlacementSpot } from "@/features/championships/history/placement-sync";
import {
  championshipMatchEvidence,
  championshipMatchEvidenceRounds,
  championshipMatchResultRevisions
} from "@/features/championships/matches-statistics/db";
import { championshipEvidenceConsumer } from "@/features/championships/matches-statistics/evidence";
import { releaseLogicalMatchEvidenceClaim } from "@/features/matches/evidence-claims";

export async function invalidateChampionshipDownstreamMatches(
  database: DatabaseExecutor,
  championshipId: number,
  matchUuids: string[],
  now = new Date().toISOString()
): Promise<void> {
  if (matchUuids.length === 0) return;
  const matches = await database
    .select()
    .from(championshipMatches)
    .where(
      and(
        eq(championshipMatches.championshipId, championshipId),
        inArray(championshipMatches.uuid, matchUuids)
      )
    );
  const order = new Map(matchUuids.map((uuid, index) => [uuid, index]));
  matches.sort(
    (left, right) => (order.get(left.uuid) ?? 0) - (order.get(right.uuid) ?? 0)
  );

  for (const match of matches) {
    await database
      .update(championshipMatchResultRevisions)
      .set({ state: "invalidated", supersededAt: now })
      .where(
        and(
          eq(championshipMatchResultRevisions.championshipMatchId, match.id),
          eq(championshipMatchResultRevisions.state, "current")
        )
      );
    const [evidence] = await database
      .select()
      .from(championshipMatchEvidence)
      .where(eq(championshipMatchEvidence.championshipMatchId, match.id));

    if (evidence) {
      await database
        .delete(championshipMatchEvidenceRounds)
        .where(eq(championshipMatchEvidenceRounds.evidenceId, evidence.id));
      await database
        .delete(championshipMatchEvidence)
        .where(eq(championshipMatchEvidence.id, evidence.id));
      await releaseLogicalMatchEvidenceClaim(
        database,
        championshipEvidenceConsumer(match.uuid)
      );
    }

    const routes = await database
      .select()
      .from(championshipProgressionRoutes)
      .where(
        and(
          eq(championshipProgressionRoutes.sourceMatchId, match.id),
          eq(championshipProgressionRoutes.state, "active")
        )
      );

    for (const route of routes) {
      await placeTeamIntoChampionshipSpot(
        database,
        route.destinationSpotId,
        null,
        now
      );
    }

    await database
      .update(championshipMatches)
      .set({
        evidenceRevision: evidence
          ? match.evidenceRevision + 1
          : match.evidenceRevision,
        resultRevision:
          match.resultRevision > 0
            ? match.resultRevision + 1
            : match.resultRevision,
        scheduleStatus: match.scheduledAt ? "scheduled" : "unscheduled",
        revision: match.revision + 1,
        updatedAt: now
      })
      .where(eq(championshipMatches.id, match.id));
  }
}

export async function placeTeamIntoChampionshipSpot(
  database: DatabaseExecutor,
  spotId: number,
  teamId: number | null,
  now = new Date().toISOString()
): Promise<boolean> {
  const [spot] = await database
    .select()
    .from(championshipSpots)
    .where(eq(championshipSpots.id, spotId));
  if (!spot || spot.currentTeamId === teamId) return false;

  const [updatedSpot] = await database
    .update(championshipSpots)
    .set({
      currentTeamId: teamId,
      revision: spot.revision + 1,
      updatedAt: now
    })
    .where(eq(championshipSpots.id, spot.id))
    .returning();
  await syncPlacementSpot(database, updatedSpot, teamId, "format");

  const affectedSideA = await database
    .select()
    .from(championshipMatches)
    .where(
      and(
        eq(championshipMatches.championshipId, spot.championshipId),
        inArray(championshipMatches.sideASpotId, [spot.id])
      )
    );
  const affectedSideB = await database
    .select()
    .from(championshipMatches)
    .where(
      and(
        eq(championshipMatches.championshipId, spot.championshipId),
        inArray(championshipMatches.sideBSpotId, [spot.id])
      )
    );

  for (const match of affectedSideA) {
    await database
      .update(championshipMatches)
      .set({
        sideATeamId: teamId,
        revision: match.revision + 1,
        updatedAt: now
      })
      .where(eq(championshipMatches.id, match.id));
  }
  for (const match of affectedSideB) {
    await database
      .update(championshipMatches)
      .set({
        sideBTeamId: teamId,
        revision: match.revision + 1,
        updatedAt: now
      })
      .where(eq(championshipMatches.id, match.id));
  }

  return true;
}
