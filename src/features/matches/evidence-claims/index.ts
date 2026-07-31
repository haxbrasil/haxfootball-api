import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/client";
import {
  logicalMatchEvidenceClaimRounds,
  logicalMatchEvidenceClaims
} from "@/features/matches/evidence-db";
import { composedMatchRounds } from "@/features/matches/db";
import type { ResolvedLogicalMatch } from "@/features/matches/resolve-logical-match";
import { conflict } from "@/shared/http/errors";

export type EvidenceClaimConsumer = {
  kind: string;
  uuid: string;
};

export async function acquireLogicalMatchEvidenceClaim(
  database: DatabaseExecutor,
  logicalMatch: ResolvedLogicalMatch,
  consumer: EvidenceClaimConsumer
): Promise<void> {
  const physicalMatchIds = logicalMatch.rounds.map((round) => round.match.id);
  await assertPhysicalMatchesUnclaimed(database, physicalMatchIds, consumer);

  const [claim] = await database
    .insert(logicalMatchEvidenceClaims)
    .values({
      consumerKind: consumer.kind,
      consumerUuid: consumer.uuid,
      logicalKind: logicalMatch.kind === "single" ? "physical" : "composed",
      physicalMatchId:
        logicalMatch.kind === "single" ? logicalMatch.firstMatch.id : null,
      composedMatchId:
        logicalMatch.kind === "composed" ? logicalMatch.composition.id : null
    })
    .onConflictDoNothing()
    .returning();

  if (!claim) {
    throw conflict("Evidence consumer already has a claimed logical match");
  }

  for (const [index, round] of logicalMatch.rounds.entries()) {
    const [claimedRound] = await database
      .insert(logicalMatchEvidenceClaimRounds)
      .values({
        claimId: claim.id,
        physicalMatchId: round.match.id,
        position: index + 1
      })
      .onConflictDoNothing()
      .returning();

    if (!claimedRound) {
      throw conflict("A physical match is already claimed as evidence");
    }
  }
}

export async function releaseLogicalMatchEvidenceClaim(
  database: DatabaseExecutor,
  consumer: EvidenceClaimConsumer
): Promise<void> {
  const [claim] = await database
    .select()
    .from(logicalMatchEvidenceClaims)
    .where(
      and(
        eq(logicalMatchEvidenceClaims.consumerKind, consumer.kind),
        eq(logicalMatchEvidenceClaims.consumerUuid, consumer.uuid)
      )
    );

  if (!claim) {
    return;
  }

  await database
    .delete(logicalMatchEvidenceClaimRounds)
    .where(eq(logicalMatchEvidenceClaimRounds.claimId, claim.id));
  await database
    .delete(logicalMatchEvidenceClaims)
    .where(eq(logicalMatchEvidenceClaims.id, claim.id));
}

export async function assertPhysicalMatchesUnclaimed(
  database: DatabaseExecutor,
  physicalMatchIds: number[],
  allowedConsumer?: EvidenceClaimConsumer
): Promise<void> {
  if (physicalMatchIds.length === 0) {
    return;
  }

  const claims = await database
    .select({
      consumerKind: logicalMatchEvidenceClaims.consumerKind,
      consumerUuid: logicalMatchEvidenceClaims.consumerUuid
    })
    .from(logicalMatchEvidenceClaimRounds)
    .innerJoin(
      logicalMatchEvidenceClaims,
      eq(logicalMatchEvidenceClaimRounds.claimId, logicalMatchEvidenceClaims.id)
    )
    .where(
      inArray(logicalMatchEvidenceClaimRounds.physicalMatchId, physicalMatchIds)
    );
  const blockingClaim = claims.find(
    (claim) =>
      claim.consumerKind !== allowedConsumer?.kind ||
      claim.consumerUuid !== allowedConsumer.uuid
  );

  if (blockingClaim) {
    throw conflict(
      `Match evidence is claimed by ${blockingClaim.consumerKind}:${blockingClaim.consumerUuid}`
    );
  }
}

export async function assertCompositionUnclaimed(
  database: DatabaseExecutor,
  compositionId: number
): Promise<void> {
  const rounds = await database
    .select({ matchId: composedMatchRounds.matchId })
    .from(composedMatchRounds)
    .where(eq(composedMatchRounds.composedMatchId, compositionId));

  await assertPhysicalMatchesUnclaimed(
    database,
    rounds.map((round) => round.matchId)
  );
}
