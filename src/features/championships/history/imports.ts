import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  db,
  type DatabaseExecutor,
  type DbTransaction,
  withDatabaseTransaction
} from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import { championships } from "@/features/championships/core/db";
import {
  championshipMatches,
  championshipSpots,
  championshipStages
} from "@/features/championships/format-scheduling/db";
import {
  championshipAwards,
  championshipHistoricalImportBatches,
  championshipHistoricalImportRows,
  championshipHistoricalUnknownValues,
  championshipPlacements,
  championshipRecords
} from "@/features/championships/history/db";
import {
  integerValue,
  normalizeHistoricalImportRow,
  numberValue,
  parseHistoricalImport,
  stringValue,
  type HistoricalImportEntityType,
  type NormalizedHistoricalImportRow
} from "@/features/championships/history/import-parser";
import {
  championshipMatchResultRevisions,
  championshipStatisticEntries
} from "@/features/championships/matches-statistics/db";
import {
  championshipHistoricalPlayerIdentities,
  championshipParticipants,
  championshipTeamIdentities,
  championshipTeamMemberships,
  championshipTeams
} from "@/features/championships/people/db";
import type {
  ApplyChampionshipHistoricalImportInput,
  ChampionshipHistoricalImportBatchResponse,
  ChampionshipHistoricalImportsQuery,
  ChampionshipHistoricalPlayerResponse,
  LinkChampionshipHistoricalPlayerInput,
  PreviewChampionshipHistoricalImportInput,
  RollbackChampionshipHistoricalImportInput
} from "@/features/championships/history/contracts";
import { badRequest, conflict, notFound } from "@/shared/http/errors";

const batchProjectionLimit = 200;
const maximumRows = 2_000;

type ImportReference = {
  id: number;
  uuid: string;
  type: HistoricalImportEntityType;
};

type StoredNormalizedRow = NormalizedHistoricalImportRow & {
  previewState: "valid" | "warning" | "invalid";
};

export async function previewChampionshipHistoricalImport(
  championshipUuid: string,
  input: PreviewChampionshipHistoricalImportInput
): Promise<ChampionshipHistoricalImportBatchResponse> {
  const parsed = parseHistoricalImport(input.format, input.source);
  if (parsed.rows.length > maximumRows) {
    throw badRequest(`Historical imports are limited to ${maximumRows} rows`);
  }
  const sourceSha256 = await sha256(input.source);

  return withDatabaseTransaction(async (tx) => {
    const [championship] = await tx
      .select()
      .from(championships)
      .where(eq(championships.uuid, championshipUuid));
    if (!championship) throw notFound("Championship not found");
    const actor = await requireChampionshipActor(tx, {
      actorAccountUuid: input.actorAccountUuid,
      championshipId: championship.id,
      permission: ["championship:admin", "championship-history:admin"]
    });
    const [existing] = await tx
      .select()
      .from(championshipHistoricalImportBatches)
      .where(
        and(
          eq(
            championshipHistoricalImportBatches.championshipId,
            championship.id
          ),
          eq(championshipHistoricalImportBatches.sourceSha256, sourceSha256)
        )
      );

    if (existing)
      return projectHistoricalImportBatch(tx, championship, existing);

    const normalized = parsed.rows.map((raw) => {
      const row = normalizeHistoricalImportRow(raw, input.mapping);
      return { ...row, previewState: row.state } satisfies StoredNormalizedRow;
    });
    const [batch] = await tx
      .insert(championshipHistoricalImportBatches)
      .values({
        championshipId: championship.id,
        format: input.format,
        sourceName: input.sourceName,
        sourceSha256,
        mapping: {
          ...input.mapping,
          columns: parsed.columns,
          previewCounts: {
            valid: normalized.filter((row) => row.state === "valid").length,
            warning: normalized.filter((row) => row.state === "warning").length,
            invalid: normalized.filter((row) => row.state === "invalid").length
          }
        },
        rowCount: parsed.rows.length,
        errorCount: normalized.filter((row) => row.state === "invalid").length,
        initiatedByAccountId: actor.account.id
      })
      .returning();

    if (parsed.rows.length > 0) {
      await tx.insert(championshipHistoricalImportRows).values(
        parsed.rows.map((raw, index) => ({
          batchId: batch.id,
          rowNumber: index + 1,
          sourceKey: normalized[index]!.sourceKey,
          raw,
          normalized: normalized[index],
          state: normalized[index]!.state,
          entityType: normalized[index]!.entityType,
          messages: normalized[index]!.messages
        }))
      );
    }

    return projectHistoricalImportBatch(tx, championship, batch);
  });
}

export async function listChampionshipHistoricalImports(
  championshipUuid: string,
  query: ChampionshipHistoricalImportsQuery
) {
  const championship = await requireHistoricalChampionship(
    db,
    championshipUuid,
    query.actorAccountUuid
  );
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const cursorBatch = query.cursor
    ? await db
        .select({ id: championshipHistoricalImportBatches.id })
        .from(championshipHistoricalImportBatches)
        .where(
          and(
            eq(
              championshipHistoricalImportBatches.championshipId,
              championship.id
            ),
            eq(championshipHistoricalImportBatches.uuid, query.cursor)
          )
        )
        .then((rows) => rows[0] ?? null)
    : null;
  if (query.cursor && !cursorBatch) {
    throw badRequest("Historical import cursor is invalid");
  }
  const batches = await db
    .select()
    .from(championshipHistoricalImportBatches)
    .where(
      and(
        eq(championshipHistoricalImportBatches.championshipId, championship.id),
        cursorBatch
          ? gt(championshipHistoricalImportBatches.id, cursorBatch.id)
          : undefined
      )
    )
    .orderBy(asc(championshipHistoricalImportBatches.id))
    .limit(limit + 1);
  const items = await Promise.all(
    batches
      .slice(0, limit)
      .map((batch) => projectHistoricalImportBatch(db, championship, batch, 20))
  );

  return {
    items,
    page: {
      limit,
      nextCursor: batches.length > limit ? batches[limit - 1]!.uuid : null
    }
  };
}

export async function getChampionshipHistoricalImport(
  championshipUuid: string,
  batchUuid: string,
  actorAccountUuid: string
) {
  const championship = await requireHistoricalChampionship(
    db,
    championshipUuid,
    actorAccountUuid
  );
  const batch = await requireImportBatch(db, championship.id, batchUuid);
  return projectHistoricalImportBatch(db, championship, batch);
}

export async function applyChampionshipHistoricalImport(
  championshipUuid: string,
  batchUuid: string,
  input: ApplyChampionshipHistoricalImportInput
): Promise<ChampionshipHistoricalImportBatchResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship-history:admin"],
      action: "history.import.applied",
      source: "historical-import"
    },
    async (tx, championship, actor) => {
      const batch = await requireImportBatch(tx, championship.id, batchUuid);
      if (batch.state === "applied") {
        throw conflict("Historical import batch is already applied");
      }
      if (batch.state === "rolled-back") {
        throw conflict("Rolled-back import batches cannot be applied again");
      }

      const rows = await tx
        .select()
        .from(championshipHistoricalImportRows)
        .where(eq(championshipHistoricalImportRows.batchId, batch.id))
        .orderBy(asc(championshipHistoricalImportRows.rowNumber));
      const references = new Map<string, ImportReference>();
      let appliedCount = 0;
      let errorCount = 0;
      const now = new Date().toISOString();

      await tx
        .update(championshipHistoricalImportBatches)
        .set({ state: "applying", updatedAt: now })
        .where(eq(championshipHistoricalImportBatches.id, batch.id));

      for (const row of [...rows].sort(compareImportRows)) {
        const normalized = row.normalized as StoredNormalizedRow | null;
        if (!normalized || normalized.previewState === "invalid") {
          errorCount += 1;
          continue;
        }

        try {
          const outcome = await applyImportRow(tx, {
            championship,
            actorAccountId: actor.account.id,
            batch,
            row,
            normalized,
            references,
            now
          });
          if (normalized.sourceKey && normalized.entityType) {
            references.set(
              referenceKey(normalized.entityType, normalized.sourceKey),
              outcome.reference
            );
          }
          await preserveUnknownValues(
            tx,
            championship.id,
            row.id,
            normalized,
            outcome.reference.uuid
          );
          await tx
            .update(championshipHistoricalImportRows)
            .set({
              state: "applied",
              entityUuid: outcome.reference.uuid,
              before: outcome.created ? null : { reused: true },
              after: {
                created: outcome.created,
                ...outcome.rollback
              },
              messages: normalized.messages,
              updatedAt: now
            })
            .where(eq(championshipHistoricalImportRows.id, row.id));
          appliedCount += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown import error";
          await tx
            .update(championshipHistoricalImportRows)
            .set({
              state: "invalid",
              messages: [...normalized.messages, `Erro ao aplicar: ${message}`],
              updatedAt: now
            })
            .where(eq(championshipHistoricalImportRows.id, row.id));
          errorCount += 1;
        }
      }

      const [updated] = await tx
        .update(championshipHistoricalImportBatches)
        .set({
          state: "applied",
          appliedCount,
          errorCount,
          appliedAt: now,
          updatedAt: now
        })
        .where(eq(championshipHistoricalImportBatches.id, batch.id))
        .returning();
      const response = await projectHistoricalImportBatch(
        tx,
        championship,
        updated
      );

      return {
        response: () => response,
        targetType: "historical-import",
        targetUuid: batch.uuid,
        before: { state: batch.state },
        after: {
          state: updated.state,
          appliedCount,
          errorCount
        },
        reason: input.reason
      };
    }
  );
}

export async function rollbackChampionshipHistoricalImport(
  championshipUuid: string,
  batchUuid: string,
  input: RollbackChampionshipHistoricalImportInput
): Promise<ChampionshipHistoricalImportBatchResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship-history:admin"],
      action: "history.import.rolled-back",
      source: "historical-import"
    },
    async (tx, championship) => {
      const batch = await requireImportBatch(tx, championship.id, batchUuid);
      if (batch.state !== "applied") {
        throw conflict("Only applied historical imports can be rolled back");
      }
      const rows = await tx
        .select()
        .from(championshipHistoricalImportRows)
        .where(eq(championshipHistoricalImportRows.batchId, batch.id));
      const now = new Date().toISOString();

      for (const row of [...rows].sort(compareRollbackRows)) {
        if (row.state !== "applied") continue;
        const after = isRecord(row.after) ? row.after : {};
        if (after.created === true) {
          await rollbackImportRow(tx, row.entityType, row.entityUuid, after);
        }
        await tx
          .delete(championshipHistoricalUnknownValues)
          .where(eq(championshipHistoricalUnknownValues.batchRowId, row.id));
        await tx
          .update(championshipHistoricalImportRows)
          .set({ state: "rolled-back", updatedAt: now })
          .where(eq(championshipHistoricalImportRows.id, row.id));
      }
      const [updated] = await tx
        .update(championshipHistoricalImportBatches)
        .set({
          state: "rolled-back",
          rolledBackAt: now,
          updatedAt: now
        })
        .where(eq(championshipHistoricalImportBatches.id, batch.id))
        .returning();
      const response = await projectHistoricalImportBatch(
        tx,
        championship,
        updated
      );

      return {
        response: () => response,
        targetType: "historical-import",
        targetUuid: batch.uuid,
        before: { state: batch.state },
        after: { state: updated.state },
        reason: input.reason
      };
    }
  );
}

export async function linkChampionshipHistoricalPlayer(
  championshipUuid: string,
  historicalPlayerUuid: string,
  input: LinkChampionshipHistoricalPlayerInput
): Promise<ChampionshipHistoricalPlayerResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship-history:admin"],
      action: "history.player.linked"
    },
    async (tx, championship, actor) => {
      const [identityRow] = await tx
        .select({ identity: championshipHistoricalPlayerIdentities })
        .from(championshipHistoricalPlayerIdentities)
        .innerJoin(
          championshipParticipants,
          eq(
            championshipParticipants.historicalPlayerIdentityId,
            championshipHistoricalPlayerIdentities.id
          )
        )
        .where(
          and(
            eq(
              championshipHistoricalPlayerIdentities.uuid,
              historicalPlayerUuid
            ),
            eq(championshipParticipants.championshipId, championship.id)
          )
        );
      const identity = identityRow?.identity;
      if (!identity) {
        throw notFound("Historical player identity not found in championship");
      }
      const currentLinkedAccount = identity.linkedAccountId
        ? await accountById(tx, identity.linkedAccountId)
        : null;
      if (
        input.expectedLinkedAccountUuid !== undefined &&
        input.expectedLinkedAccountUuid !== (currentLinkedAccount?.uuid ?? null)
      ) {
        throw conflict(
          "Historical player link changed; refresh and try again",
          {
            currentLinkedAccountUuid: currentLinkedAccount?.uuid ?? null
          }
        );
      }
      const account = input.accountUuid
        ? await requireAccount(tx, input.accountUuid)
        : null;
      const now = new Date().toISOString();
      const [updated] = await tx
        .update(championshipHistoricalPlayerIdentities)
        .set({
          linkedAccountId: account?.id ?? null,
          linkedAt: account ? now : null,
          linkedByAccountId: account ? actor.account.id : null,
          updatedAt: now
        })
        .where(eq(championshipHistoricalPlayerIdentities.id, identity.id))
        .returning();
      const response = toHistoricalPlayerResponse(updated, account);

      return {
        response: () => response,
        targetType: "historical-player",
        targetUuid: identity.uuid,
        before: {
          linkedAccountUuid: currentLinkedAccount?.uuid ?? null
        },
        after: {
          linkedAccountUuid: account?.uuid ?? null
        },
        reason: input.reason
      };
    }
  );
}

async function applyImportRow(
  tx: DbTransaction,
  context: {
    championship: typeof championships.$inferSelect;
    actorAccountId: number;
    batch: typeof championshipHistoricalImportBatches.$inferSelect;
    row: typeof championshipHistoricalImportRows.$inferSelect;
    normalized: StoredNormalizedRow;
    references: Map<string, ImportReference>;
    now: string;
  }
) {
  const { championship, normalized, references, row, actorAccountId, now } =
    context;
  const type = normalized.entityType!;
  const values = normalized.values;
  const key = normalized.sourceKey ?? `row-${row.rowNumber}`;
  const reused = (reference: ImportReference) => ({
    reference,
    created: false,
    rollback: {}
  });
  const created = (
    reference: ImportReference,
    rollback: Record<string, unknown> = {}
  ) => ({ reference, created: true, rollback });

  if (type === "team-identity") {
    const slug = stringValue(values.slug)!;
    const [existing] = await tx
      .select()
      .from(championshipTeamIdentities)
      .where(eq(championshipTeamIdentities.slug, slug));
    if (existing) return reused(reference(type, existing));
    const [identity] = await tx
      .insert(championshipTeamIdentities)
      .values({
        slug,
        name: stringValue(values.name)!,
        abbreviation: stringValue(values.abbreviation),
        colors: listValue(values.colors)
      })
      .returning();
    return created(reference(type, identity));
  }

  if (type === "team") {
    const name = stringValue(values.name)!;
    const abbreviation = stringValue(values.abbreviation);
    const [existing] = await tx
      .select()
      .from(championshipTeams)
      .where(
        and(
          eq(championshipTeams.championshipId, championship.id),
          eq(championshipTeams.name, name)
        )
      );
    if (existing) return reused(reference(type, existing));
    const identity = stringValue(values.identityKey)
      ? await resolveReference(
          tx,
          references,
          championship.id,
          "team-identity",
          stringValue(values.identityKey)!
        )
      : null;
    const [team] = await tx
      .insert(championshipTeams)
      .values({
        championshipId: championship.id,
        teamIdentityId: identity?.id ?? null,
        name,
        abbreviation,
        seed: integerValue(values.seed),
        displayOrder:
          integerValue(values.displayOrder) ??
          (await nextTeamDisplayOrder(tx, championship.id)),
        colors: listValue(values.colors)
      })
      .returning();
    return created(reference(type, team));
  }

  if (type === "historical-player") {
    const existingReference = references.get(referenceKey(type, key));
    if (existingReference) return reused(existingReference);
    const [identity] = await tx
      .insert(championshipHistoricalPlayerIdentities)
      .values({
        displayName: stringValue(values.displayName)!,
        aliases: listValue(values.aliases),
        notes: stringValue(values.notes)
      })
      .returning();
    return created(reference(type, identity));
  }

  if (type === "participant") {
    const accountUuid = stringValue(values.accountUuid);
    const historicalKey = stringValue(values.historicalPlayerKey);
    const account = accountUuid ? await requireAccount(tx, accountUuid) : null;
    const historical = historicalKey
      ? await resolveReference(
          tx,
          references,
          championship.id,
          "historical-player",
          historicalKey
        )
      : null;
    const [existing] = await tx
      .select()
      .from(championshipParticipants)
      .where(
        and(
          eq(championshipParticipants.championshipId, championship.id),
          account
            ? eq(championshipParticipants.accountId, account.id)
            : eq(
                championshipParticipants.historicalPlayerIdentityId,
                historical!.id
              )
        )
      );
    if (existing) return reused(reference(type, existing));
    const [participant] = await tx
      .insert(championshipParticipants)
      .values({
        championshipId: championship.id,
        accountId: account?.id ?? null,
        historicalPlayerIdentityId: historical?.id ?? null,
        displayNameSnapshot: stringValue(values.displayName)!,
        status: participantStatus(values.status),
        origin: "historical-import",
        registeredAt: stringValue(values.registeredAt) ?? now,
        revision: 1
      })
      .returning();
    return created(reference(type, participant));
  }

  if (type === "roster-membership") {
    const team = await resolveReference(
      tx,
      references,
      championship.id,
      "team",
      stringValue(values.teamKey)!
    );
    const participant = await resolveReference(
      tx,
      references,
      championship.id,
      "participant",
      stringValue(values.participantKey)!
    );
    const [existing] = await tx
      .select()
      .from(championshipTeamMemberships)
      .where(
        and(
          eq(championshipTeamMemberships.championshipId, championship.id),
          eq(championshipTeamMemberships.teamId, team.id),
          eq(championshipTeamMemberships.participantId, participant.id),
          eq(
            championshipTeamMemberships.role,
            stringValue(values.role) === "gm" ? "gm" : "player"
          )
        )
      );
    if (existing) return reused(reference(type, existing));
    const [membership] = await tx
      .insert(championshipTeamMemberships)
      .values({
        championshipId: championship.id,
        teamId: team.id,
        participantId: participant.id,
        role: stringValue(values.role) === "gm" ? "gm" : "player",
        acquisitionSource: "historical-import",
        acquisitionReferenceUuid: context.batch.uuid,
        priceUnitsSnapshot: integerValue(values.priceUnits),
        effectiveFromRevision: championship.revision,
        effectiveToRevision: integerValue(values.effectiveToRevision),
        startedAt: stringValue(values.startedAt) ?? now,
        endedAt: stringValue(values.endedAt)
      })
      .returning();
    return created(reference(type, membership));
  }

  if (type === "stage") {
    const name = stringValue(values.name)!;
    const [existing] = await tx
      .select()
      .from(championshipStages)
      .where(
        and(
          eq(championshipStages.championshipId, championship.id),
          eq(championshipStages.name, name)
        )
      );
    if (existing) return reused(reference(type, existing));
    const [stage] = await tx
      .insert(championshipStages)
      .values({
        championshipId: championship.id,
        name,
        displayOrder:
          integerValue(values.displayOrder) ??
          (await nextStageDisplayOrder(tx, championship.id)),
        engine: stageEngine(values.engine),
        state: "completed",
        config: { historicalImportBatchUuid: context.batch.uuid }
      })
      .returning();
    return created(reference(type, stage));
  }

  if (type === "match") {
    const stageResolution = stringValue(values.stageKey)
      ? {
          reference: await resolveReference(
            tx,
            references,
            championship.id,
            "stage",
            stringValue(values.stageKey)!
          ),
          created: false
        }
      : await requireOrCreateHistoricalStage(
          tx,
          championship.id,
          context.batch
        );
    const stage = stageResolution.reference;
    const sideA = await resolveReference(
      tx,
      references,
      championship.id,
      "team",
      stringValue(values.sideATeamKey)!
    );
    const sideB = await resolveReference(
      tx,
      references,
      championship.id,
      "team",
      stringValue(values.sideBTeamKey)!
    );
    const displayOrder = await nextMatchDisplayOrder(tx, stage.id);
    const [sideASpot, sideBSpot] = await tx
      .insert(championshipSpots)
      .values([
        {
          championshipId: championship.id,
          stageId: stage.id,
          key: `history-${context.batch.uuid}-${row.rowNumber}-a`,
          label: `${stringValue(values.label)!} · lado A`,
          kind: "match-side",
          displayOrder: displayOrder * 2,
          currentTeamId: sideA.id
        },
        {
          championshipId: championship.id,
          stageId: stage.id,
          key: `history-${context.batch.uuid}-${row.rowNumber}-b`,
          label: `${stringValue(values.label)!} · lado B`,
          kind: "match-side",
          displayOrder: displayOrder * 2 + 1,
          currentTeamId: sideB.id
        }
      ])
      .returning();
    const sideAScore = integerValue(values.sideAScore);
    const sideBScore = integerValue(values.sideBScore);
    const hasResult = sideAScore !== null && sideBScore !== null;
    const [match] = await tx
      .insert(championshipMatches)
      .values({
        championshipId: championship.id,
        stageId: stage.id,
        label: stringValue(values.label)!,
        displayOrder,
        sideASpotId: sideASpot!.id,
        sideBSpotId: sideBSpot!.id,
        sideATeamId: sideA.id,
        sideBTeamId: sideB.id,
        scheduledAt: stringValue(values.playedAt),
        scheduleStatus: hasResult ? "played" : "unscheduled",
        bracket: bracket(values.bracket),
        resultRevision: hasResult ? 1 : 0,
        revision: hasResult ? 1 : 0
      })
      .returning();
    let resultUuid: string | null = null;
    if (hasResult) {
      const outcomes = scoreOutcomes(sideAScore, sideBScore, values);
      const [result] = await tx
        .insert(championshipMatchResultRevisions)
        .values({
          championshipId: championship.id,
          championshipMatchId: match.id,
          revision: 1,
          state: "current",
          sideATeamId: sideA.id,
          sideBTeamId: sideB.id,
          method: "historical",
          sideAPlayedScore: sideAScore,
          sideBPlayedScore: sideBScore,
          sideAOfficialScore: sideAScore,
          sideBOfficialScore: sideBScore,
          sideAOutcome: outcomes.sideA,
          sideBOutcome: outcomes.sideB,
          note: stringValue(values.note),
          settledByAccountId: actorAccountId,
          settledAt: stringValue(values.playedAt) ?? now
        })
        .returning();
      resultUuid = result.uuid;
    }
    return created(reference(type, match), {
      resultUuid,
      spotUuids: [sideASpot!.uuid, sideBSpot!.uuid],
      createdStageUuid: stageResolution.created ? stage.uuid : null
    });
  }

  if (type === "statistic") {
    const match = await resolveReference(
      tx,
      references,
      championship.id,
      "match",
      stringValue(values.matchKey)!
    );
    const [result] = await tx
      .select()
      .from(championshipMatchResultRevisions)
      .where(
        and(
          eq(championshipMatchResultRevisions.championshipMatchId, match.id),
          eq(championshipMatchResultRevisions.state, "current")
        )
      );
    if (!result) throw new Error("Statistics require a settled match");
    const participantKey = stringValue(values.participantKey);
    const teamKey = stringValue(values.teamKey);
    const participant = participantKey
      ? await resolveReference(
          tx,
          references,
          championship.id,
          "participant",
          participantKey
        )
      : null;
    const team = teamKey
      ? await resolveReference(tx, references, championship.id, "team", teamKey)
      : null;
    const [entry] = await tx
      .insert(championshipStatisticEntries)
      .values({
        championshipId: championship.id,
        resultRevisionId: result.id,
        participantId: participant?.id ?? null,
        displayNameSnapshot: stringValue(values.displayName),
        teamId: team?.id ?? null,
        metricKey: stringValue(values.metricKey)!,
        numericValue: numberValue(values.numericValue)!,
        source: "administrative"
      })
      .returning();
    return created(
      { id: entry.id, uuid: crypto.randomUUID(), type },
      { statisticId: entry.id }
    );
  }

  if (type === "placement") {
    const team = await resolveReference(
      tx,
      references,
      championship.id,
      "team",
      stringValue(values.teamKey)!
    );
    const rank = integerValue(values.rank);
    if (!rank || rank < 1) throw new Error("Placement rank must be positive");
    const [existing] = await tx
      .select()
      .from(championshipPlacements)
      .where(
        and(
          eq(championshipPlacements.championshipId, championship.id),
          eq(championshipPlacements.rank, rank)
        )
      );
    if (existing) {
      if (existing.teamId !== team.id) {
        throw new Error(`Placement ${rank} is already occupied`);
      }
      return reused(reference(type, existing));
    }
    const [teamRow] = await tx
      .select()
      .from(championshipTeams)
      .where(eq(championshipTeams.id, team.id));
    const [placement] = await tx
      .insert(championshipPlacements)
      .values({
        championshipId: championship.id,
        teamId: team.id,
        rank,
        teamIdentityIdSnapshot: teamRow!.teamIdentityId,
        teamNameSnapshot: teamRow!.name,
        source: "historical-import",
        awardedByAccountId: actorAccountId
      })
      .returning();
    return created(reference(type, placement));
  }

  if (type === "award") {
    const target = await resolveAwardReference(
      tx,
      references,
      championship.id,
      stringValue(values.targetType)!,
      stringValue(values.targetKey)!
    );
    const [award] = await tx
      .insert(championshipAwards)
      .values({
        championshipId: championship.id,
        kind: stringValue(values.kind)!,
        rank: integerValue(values.rank),
        targetType: target.targetType,
        ...target.columns,
        displayLabel: stringValue(values.displayLabel)!,
        note: stringValue(values.note),
        awardedByAccountId: actorAccountId,
        awardedAt: stringValue(values.awardedAt) ?? now
      })
      .returning();
    return created(reference(type, award));
  }

  if (type === "record") {
    const targetType = recordTargetType(values.targetType);
    const target =
      targetType === "account"
        ? await requireAccount(tx, stringValue(values.targetKey)!).then(
            (account) => ({
              id: account.id,
              uuid: account.uuid,
              type: "participant" as const
            })
          )
        : await resolveReference(
            tx,
            references,
            championship.id,
            referenceTypeForTarget(targetType),
            stringValue(values.targetKey)!
          );
    const [record] = await tx
      .insert(championshipRecords)
      .values({
        championshipId: championship.id,
        scope: "championship",
        metricKey: stringValue(values.metricKey)!,
        targetType,
        targetUuid: target.uuid,
        numericValue: numberValue(values.numericValue),
        textValue: stringValue(values.textValue),
        state: "current"
      })
      .returning();
    return created(reference(type, record));
  }

  const [unknown] = await tx
    .insert(championshipHistoricalUnknownValues)
    .values({
      batchRowId: row.id,
      championshipId: championship.id,
      entityType: stringValue(values.relatedEntityType) ?? "unknown",
      entityUuid: stringValue(values.relatedEntityUuid),
      field: stringValue(values.field)!,
      rawValue: stringValue(values.rawValue),
      note: stringValue(values.note)
    })
    .returning();
  return created(
    { id: unknown.id, uuid: crypto.randomUUID(), type },
    { unknownValueId: unknown.id }
  );
}

async function rollbackImportRow(
  tx: DbTransaction,
  entityType: string | null,
  entityUuid: string | null,
  after: Record<string, unknown>
) {
  if (entityType === "statistic" && typeof after.statisticId === "number") {
    await tx
      .delete(championshipStatisticEntries)
      .where(eq(championshipStatisticEntries.id, after.statisticId));
  } else if (entityType === "award" && entityUuid) {
    await tx
      .delete(championshipAwards)
      .where(eq(championshipAwards.uuid, entityUuid));
  } else if (entityType === "record" && entityUuid) {
    await tx
      .delete(championshipRecords)
      .where(eq(championshipRecords.uuid, entityUuid));
  } else if (entityType === "placement" && entityUuid) {
    await tx
      .delete(championshipPlacements)
      .where(eq(championshipPlacements.uuid, entityUuid));
  } else if (entityType === "match" && entityUuid) {
    const [match] = await tx
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.uuid, entityUuid));
    if (match) {
      await tx
        .delete(championshipMatchResultRevisions)
        .where(
          eq(championshipMatchResultRevisions.championshipMatchId, match.id)
        );
      await tx
        .delete(championshipMatches)
        .where(eq(championshipMatches.id, match.id));
      const spotUuids = Array.isArray(after.spotUuids)
        ? after.spotUuids.filter(
            (value): value is string => typeof value === "string"
          )
        : [];
      if (spotUuids.length > 0) {
        await tx
          .delete(championshipSpots)
          .where(inArray(championshipSpots.uuid, spotUuids));
      }
      if (typeof after.createdStageUuid === "string") {
        await tx
          .delete(championshipStages)
          .where(eq(championshipStages.uuid, after.createdStageUuid));
      }
    }
  } else if (entityType === "roster-membership" && entityUuid) {
    await tx
      .delete(championshipTeamMemberships)
      .where(eq(championshipTeamMemberships.uuid, entityUuid));
  } else if (entityType === "participant" && entityUuid) {
    await tx
      .delete(championshipParticipants)
      .where(eq(championshipParticipants.uuid, entityUuid));
  } else if (entityType === "team" && entityUuid) {
    await tx
      .delete(championshipTeams)
      .where(eq(championshipTeams.uuid, entityUuid));
  } else if (entityType === "stage" && entityUuid) {
    await tx
      .delete(championshipStages)
      .where(eq(championshipStages.uuid, entityUuid));
  } else if (entityType === "historical-player" && entityUuid) {
    await tx
      .delete(championshipHistoricalPlayerIdentities)
      .where(eq(championshipHistoricalPlayerIdentities.uuid, entityUuid));
  } else if (entityType === "team-identity" && entityUuid) {
    await tx
      .delete(championshipTeamIdentities)
      .where(eq(championshipTeamIdentities.uuid, entityUuid));
  }
}

async function preserveUnknownValues(
  tx: DbTransaction,
  championshipId: number,
  batchRowId: number,
  normalized: StoredNormalizedRow,
  entityUuid: string
) {
  const entries = Object.entries(normalized.unmapped);
  if (entries.length === 0) return;
  await tx.insert(championshipHistoricalUnknownValues).values(
    entries.map(([field, value]) => ({
      batchRowId,
      championshipId,
      entityType: normalized.entityType ?? "unknown",
      entityUuid,
      field,
      rawValue: typeof value === "string" ? value : JSON.stringify(value),
      note: "Unmapped source value"
    }))
  );
}

async function projectHistoricalImportBatch(
  database: DatabaseExecutor,
  championship: typeof championships.$inferSelect,
  batch: typeof championshipHistoricalImportBatches.$inferSelect,
  requestedLimit = batchProjectionLimit
): Promise<ChampionshipHistoricalImportBatchResponse> {
  const limit = Math.min(batchProjectionLimit, Math.max(1, requestedLimit));
  const rows = await database
    .select()
    .from(championshipHistoricalImportRows)
    .where(eq(championshipHistoricalImportRows.batchId, batch.id))
    .orderBy(asc(championshipHistoricalImportRows.rowNumber))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map((row) => ({
    rowNumber: row.rowNumber,
    sourceKey: row.sourceKey,
    entityType: row.entityType,
    entityUuid: row.entityUuid,
    state: row.state,
    raw: row.raw,
    normalized: row.normalized,
    messages: row.messages ?? []
  }));
  const normalizedRows = rows.map(
    (row) => row.normalized as StoredNormalizedRow | null
  );
  const mapping = batch.mapping;
  const columns = Array.isArray(mapping.columns)
    ? mapping.columns.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const previewCounts = isRecord(mapping.previewCounts)
    ? mapping.previewCounts
    : null;

  return {
    uuid: batch.uuid,
    championshipUuid: championship.uuid,
    format: batch.format,
    sourceName: batch.sourceName,
    sourceSha256: batch.sourceSha256,
    mapping,
    state: batch.state,
    columns,
    rowCount: batch.rowCount,
    validCount:
      typeof previewCounts?.valid === "number"
        ? previewCounts.valid
        : normalizedRows.filter((row) => row?.previewState === "valid").length,
    warningCount:
      typeof previewCounts?.warning === "number"
        ? previewCounts.warning
        : normalizedRows.filter((row) => row?.previewState === "warning")
            .length,
    invalidCount:
      typeof previewCounts?.invalid === "number"
        ? previewCounts.invalid
        : normalizedRows.filter((row) => row?.previewState === "invalid")
            .length,
    appliedCount: batch.appliedCount,
    errorCount: batch.errorCount,
    appliedAt: batch.appliedAt,
    rolledBackAt: batch.rolledBackAt,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    rows: {
      items,
      totalCount: batch.rowCount,
      truncated: batch.rowCount > items.length
    }
  };
}

async function requireHistoricalChampionship(
  database: DatabaseExecutor,
  championshipUuid: string,
  actorAccountUuid: string
) {
  const [championship] = await database
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));
  if (!championship) throw notFound("Championship not found");
  await requireChampionshipActor(database, {
    actorAccountUuid,
    championshipId: championship.id,
    permission: ["championship:admin", "championship-history:admin"]
  });
  return championship;
}

async function requireImportBatch(
  database: DatabaseExecutor,
  championshipId: number,
  batchUuid: string
) {
  const [batch] = await database
    .select()
    .from(championshipHistoricalImportBatches)
    .where(
      and(
        eq(championshipHistoricalImportBatches.championshipId, championshipId),
        eq(championshipHistoricalImportBatches.uuid, batchUuid)
      )
    );
  if (!batch) throw notFound("Historical import batch not found");
  return batch;
}

async function resolveReference(
  database: DatabaseExecutor,
  references: Map<string, ImportReference>,
  championshipId: number,
  type: HistoricalImportEntityType,
  key: string
): Promise<ImportReference> {
  const fromBatch = references.get(referenceKey(type, key));
  if (fromBatch) return fromBatch;
  const fromPreviousBatch = await resolvePreviouslyImportedReference(
    database,
    championshipId,
    type,
    key
  );
  if (fromPreviousBatch) return fromPreviousBatch;

  if (type === "team") {
    const [team] = await database
      .select()
      .from(championshipTeams)
      .where(
        and(
          eq(championshipTeams.championshipId, championshipId),
          eq(championshipTeams.name, key)
        )
      );
    if (team) return reference(type, team);
  } else if (type === "stage") {
    const [stage] = await database
      .select()
      .from(championshipStages)
      .where(
        and(
          eq(championshipStages.championshipId, championshipId),
          eq(championshipStages.name, key)
        )
      );
    if (stage) return reference(type, stage);
  } else if (type === "participant") {
    const [participant] = await database
      .select()
      .from(championshipParticipants)
      .where(
        and(
          eq(championshipParticipants.championshipId, championshipId),
          eq(championshipParticipants.displayNameSnapshot, key)
        )
      );
    if (participant) return reference(type, participant);
  } else if (type === "historical-player") {
    const [identity] = await database
      .select()
      .from(championshipHistoricalPlayerIdentities)
      .innerJoin(
        championshipParticipants,
        eq(
          championshipParticipants.historicalPlayerIdentityId,
          championshipHistoricalPlayerIdentities.id
        )
      )
      .where(
        and(
          eq(championshipParticipants.championshipId, championshipId),
          eq(championshipHistoricalPlayerIdentities.displayName, key)
        )
      );
    if (identity) {
      return reference(
        type,
        identity.championship_historical_player_identities
      );
    }
  } else if (type === "match") {
    const [match] = await database
      .select()
      .from(championshipMatches)
      .where(
        and(
          eq(championshipMatches.championshipId, championshipId),
          eq(championshipMatches.label, key)
        )
      );
    if (match) return reference(type, match);
  } else if (type === "team-identity") {
    const [identity] = await database
      .select()
      .from(championshipTeamIdentities)
      .where(eq(championshipTeamIdentities.slug, key));
    if (identity) return reference(type, identity);
  }

  throw new Error(`Reference ${type}:${key} was not found`);
}

async function resolvePreviouslyImportedReference(
  database: DatabaseExecutor,
  championshipId: number,
  type: HistoricalImportEntityType,
  key: string
): Promise<ImportReference | null> {
  const [imported] = await database
    .select({ entityUuid: championshipHistoricalImportRows.entityUuid })
    .from(championshipHistoricalImportRows)
    .innerJoin(
      championshipHistoricalImportBatches,
      eq(
        championshipHistoricalImportBatches.id,
        championshipHistoricalImportRows.batchId
      )
    )
    .where(
      and(
        eq(championshipHistoricalImportBatches.championshipId, championshipId),
        eq(championshipHistoricalImportBatches.state, "applied"),
        eq(championshipHistoricalImportRows.state, "applied"),
        eq(championshipHistoricalImportRows.entityType, type),
        sql`lower(trim(${championshipHistoricalImportRows.sourceKey})) = ${key.trim().toLowerCase()}`
      )
    )
    .orderBy(asc(championshipHistoricalImportRows.id))
    .limit(1);
  if (!imported?.entityUuid) return null;

  if (type === "team") {
    const [row] = await database
      .select()
      .from(championshipTeams)
      .where(
        and(
          eq(championshipTeams.championshipId, championshipId),
          eq(championshipTeams.uuid, imported.entityUuid)
        )
      );
    return row ? reference(type, row) : null;
  }
  if (type === "stage") {
    const [row] = await database
      .select()
      .from(championshipStages)
      .where(
        and(
          eq(championshipStages.championshipId, championshipId),
          eq(championshipStages.uuid, imported.entityUuid)
        )
      );
    return row ? reference(type, row) : null;
  }
  if (type === "participant") {
    const [row] = await database
      .select()
      .from(championshipParticipants)
      .where(
        and(
          eq(championshipParticipants.championshipId, championshipId),
          eq(championshipParticipants.uuid, imported.entityUuid)
        )
      );
    return row ? reference(type, row) : null;
  }
  if (type === "historical-player") {
    const [row] = await database
      .select({ identity: championshipHistoricalPlayerIdentities })
      .from(championshipHistoricalPlayerIdentities)
      .innerJoin(
        championshipParticipants,
        eq(
          championshipParticipants.historicalPlayerIdentityId,
          championshipHistoricalPlayerIdentities.id
        )
      )
      .where(
        and(
          eq(championshipParticipants.championshipId, championshipId),
          eq(championshipHistoricalPlayerIdentities.uuid, imported.entityUuid)
        )
      );
    return row ? reference(type, row.identity) : null;
  }
  if (type === "match") {
    const [row] = await database
      .select()
      .from(championshipMatches)
      .where(
        and(
          eq(championshipMatches.championshipId, championshipId),
          eq(championshipMatches.uuid, imported.entityUuid)
        )
      );
    return row ? reference(type, row) : null;
  }
  if (type === "team-identity") {
    const [row] = await database
      .select()
      .from(championshipTeamIdentities)
      .where(eq(championshipTeamIdentities.uuid, imported.entityUuid));
    return row ? reference(type, row) : null;
  }

  return null;
}

async function resolveAwardReference(
  database: DatabaseExecutor,
  references: Map<string, ImportReference>,
  championshipId: number,
  targetType: string,
  targetKey: string
) {
  if (targetType === "account") {
    const account = await requireAccount(database, targetKey);
    return {
      targetType: "account" as const,
      columns: { accountId: account.id }
    };
  }
  const referenceType = referenceTypeForTarget(targetType);
  const target = await resolveReference(
    database,
    references,
    championshipId,
    referenceType,
    targetKey
  );
  return {
    targetType: awardTargetType(targetType),
    columns:
      targetType === "team"
        ? { teamId: target.id }
        : targetType === "team-identity"
          ? { teamIdentityIdSnapshot: target.id }
          : targetType === "historical-player"
            ? { historicalPlayerIdentityId: target.id }
            : { participantId: target.id }
  };
}

async function requireOrCreateHistoricalStage(
  tx: DbTransaction,
  championshipId: number,
  batch: typeof championshipHistoricalImportBatches.$inferSelect
) {
  const name = "Jogos históricos";
  const [existing] = await tx
    .select()
    .from(championshipStages)
    .where(
      and(
        eq(championshipStages.championshipId, championshipId),
        eq(championshipStages.name, name)
      )
    );
  if (existing) {
    return { reference: reference("stage", existing), created: false };
  }
  const [stage] = await tx
    .insert(championshipStages)
    .values({
      championshipId,
      name,
      displayOrder: await nextStageDisplayOrder(tx, championshipId),
      engine: "manual",
      state: "completed",
      config: { historicalImportBatchUuid: batch.uuid }
    })
    .returning();
  return { reference: reference("stage", stage), created: true };
}

async function nextTeamDisplayOrder(
  database: DatabaseExecutor,
  championshipId: number
) {
  const [row] = await database
    .select({ maximum: sql<number>`max(${championshipTeams.displayOrder})` })
    .from(championshipTeams)
    .where(eq(championshipTeams.championshipId, championshipId));
  return (row?.maximum ?? -1) + 1;
}

async function nextStageDisplayOrder(
  database: DatabaseExecutor,
  championshipId: number
) {
  const [row] = await database
    .select({ maximum: sql<number>`max(${championshipStages.displayOrder})` })
    .from(championshipStages)
    .where(eq(championshipStages.championshipId, championshipId));
  return (row?.maximum ?? -1) + 1;
}

async function nextMatchDisplayOrder(
  database: DatabaseExecutor,
  stageId: number
) {
  const [row] = await database
    .select({ maximum: sql<number>`max(${championshipMatches.displayOrder})` })
    .from(championshipMatches)
    .where(eq(championshipMatches.stageId, stageId));
  return (row?.maximum ?? -1) + 1;
}

function compareImportRows(
  left: typeof championshipHistoricalImportRows.$inferSelect,
  right: typeof championshipHistoricalImportRows.$inferSelect
) {
  return (
    importPriority(left.entityType) - importPriority(right.entityType) ||
    left.rowNumber - right.rowNumber
  );
}

function compareRollbackRows(
  left: typeof championshipHistoricalImportRows.$inferSelect,
  right: typeof championshipHistoricalImportRows.$inferSelect
) {
  return (
    importPriority(right.entityType) - importPriority(left.entityType) ||
    right.rowNumber - left.rowNumber
  );
}

function importPriority(entityType: string | null) {
  return (
    {
      "team-identity": 0,
      team: 1,
      "historical-player": 2,
      participant: 3,
      "roster-membership": 4,
      stage: 5,
      match: 6,
      statistic: 7,
      placement: 8,
      award: 9,
      record: 10,
      unknown: 11
    }[entityType ?? "unknown"] ?? 99
  );
}

function reference(
  type: HistoricalImportEntityType,
  row: { id: number; uuid: string }
): ImportReference {
  return { id: row.id, uuid: row.uuid, type };
}

function referenceKey(type: HistoricalImportEntityType, sourceKey: string) {
  return `${type}:${sourceKey.trim().toLowerCase()}`;
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const text = stringValue(value);
  return text
    ? text
        .split(/[|;]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function participantStatus(value: unknown) {
  const status = stringValue(value);
  return ["pending", "active", "withdrawn", "ineligible", "removed"].includes(
    status ?? ""
  )
    ? (status as "pending" | "active" | "withdrawn" | "ineligible" | "removed")
    : "active";
}

function stageEngine(value: unknown) {
  const engine = stringValue(value);
  return [
    "manual",
    "single-elimination",
    "double-elimination",
    "standings"
  ].includes(engine ?? "")
    ? (engine as
        | "manual"
        | "single-elimination"
        | "double-elimination"
        | "standings")
    : "manual";
}

function bracket(value: unknown) {
  const item = stringValue(value);
  return ["winners", "losers", "grand-final", "placement", "none"].includes(
    item ?? ""
  )
    ? (item as "winners" | "losers" | "grand-final" | "placement" | "none")
    : "none";
}

function scoreOutcomes(
  sideA: number,
  sideB: number,
  values: Record<string, unknown>
) {
  const explicitA = stringValue(values.sideAOutcome);
  const explicitB = stringValue(values.sideBOutcome);
  if (
    ["win", "loss", "draw"].includes(explicitA ?? "") &&
    ["win", "loss", "draw"].includes(explicitB ?? "")
  ) {
    return {
      sideA: explicitA as "win" | "loss" | "draw",
      sideB: explicitB as "win" | "loss" | "draw"
    };
  }
  return sideA === sideB
    ? { sideA: "draw" as const, sideB: "draw" as const }
    : sideA > sideB
      ? { sideA: "win" as const, sideB: "loss" as const }
      : { sideA: "loss" as const, sideB: "win" as const };
}

function awardTargetType(value: string) {
  if (
    [
      "team",
      "team-identity",
      "participant",
      "account",
      "historical-player"
    ].includes(value)
  ) {
    return value as
      | "team"
      | "team-identity"
      | "participant"
      | "account"
      | "historical-player";
  }
  throw new Error(`Unsupported award target type ${value}`);
}

function recordTargetType(value: unknown) {
  const type = stringValue(value);
  if (
    ["team", "participant", "account", "historical-player"].includes(type ?? "")
  ) {
    return type as "team" | "participant" | "account" | "historical-player";
  }
  throw new Error(`Unsupported record target type ${type}`);
}

function referenceTypeForTarget(value: string): HistoricalImportEntityType {
  if (value === "team") return "team";
  if (value === "team-identity") return "team-identity";
  if (value === "participant") return "participant";
  if (value === "historical-player") return "historical-player";
  if (value === "account") return "participant";
  throw new Error(`Unsupported reference target type ${value}`);
}

async function requireAccount(database: DatabaseExecutor, accountUuid: string) {
  const [account] = await database
    .select()
    .from(accounts)
    .where(eq(accounts.uuid, accountUuid));
  if (!account) throw new Error(`Account ${accountUuid} was not found`);
  return account;
}

async function accountById(database: DatabaseExecutor, accountId: number) {
  const [account] = await database
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return account ?? null;
}

function toHistoricalPlayerResponse(
  identity: typeof championshipHistoricalPlayerIdentities.$inferSelect,
  account: typeof accounts.$inferSelect | null
): ChampionshipHistoricalPlayerResponse {
  return {
    uuid: identity.uuid,
    displayName: identity.displayName,
    aliases: identity.aliases ?? [],
    notes: identity.notes,
    linkedAccount: account ? { uuid: account.uuid, name: account.name } : null,
    linkedAt: identity.linkedAt,
    updatedAt: identity.updatedAt
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
