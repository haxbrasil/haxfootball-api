import { and, asc, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, type DatabaseExecutor, type DbTransaction } from "@/db/client";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  championships,
  type Championship
} from "@/features/championships/core/db";
import {
  championshipCapExceptions,
  championshipParticipantPrices,
  championshipSalaryLedgerEntries
} from "@/features/championships/finance/db";
import {
  championshipParticipants,
  championshipTeamMemberships,
  championshipTeams
} from "@/features/championships/people/db";
import type {
  ChampionshipRosterHistoryQuery,
  ExecuteChampionshipRosterMoveInput,
  PreviewChampionshipRosterMoveInput,
  ReorderChampionshipRosterInput
} from "@/features/championships/_shared/http/inputs";
import type {
  ChampionshipRosterMembershipResponse,
  ChampionshipRosterMovePreviewResponse,
  ChampionshipRosterOrderResponse
} from "@/features/championships/_shared/http/responses";
import { badRequest, conflict, notFound } from "@/shared/http/errors";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse
} from "@lib";

type MoveContext = {
  preview: ChampionshipRosterMovePreviewResponse;
  participant: typeof championshipParticipants.$inferSelect;
  price: typeof championshipParticipantPrices.$inferSelect | null;
  sourceMembership: typeof championshipTeamMemberships.$inferSelect | null;
  sourceTeam: typeof championshipTeams.$inferSelect | null;
  targetTeam: typeof championshipTeams.$inferSelect | null;
};

export type ChampionshipRosterAcquisitionSource =
  (typeof championshipTeamMemberships.$inferInsert)["acquisitionSource"];

export type ApplyChampionshipRosterMoveInput = {
  participantId: string;
  targetTeamId: string | null;
  role?: "gm" | "player";
  acquisitionSource: ChampionshipRosterAcquisitionSource;
  acquisitionReferenceUuid?: string | null;
  actorAccountId: number;
  allowCapException?: boolean;
  reason?: string | null;
};

export type AppliedChampionshipRosterMove = {
  membership: ChampionshipRosterMembershipResponse;
  preview: ChampionshipRosterMovePreviewResponse;
};

export type ApplyChampionshipRosterExchangeInput = {
  items: Array<{
    participantId: string;
    fromTeamId: string;
    toTeamId: string;
  }>;
  acquisitionReferenceUuid: string;
  actorAccountId: number;
  reason?: string | null;
};

export type AppliedChampionshipRosterExchange = {
  memberships: ChampionshipRosterMembershipResponse[];
  teams: Array<{
    teamUuid: string;
    teamName: string;
    rosterRevision: number;
    rosterSizeBefore: number;
    rosterSizeAfter: number;
    usageBeforeUnits: number;
    usageAfterUnits: number;
    remainingAfterUnits: number;
  }>;
};

export async function previewChampionshipRosterMove(
  championshipUuid: string,
  input: PreviewChampionshipRosterMoveInput
): Promise<ChampionshipRosterMovePreviewResponse> {
  const [championship] = await db
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  await requireChampionshipActor(db, {
    actorAccountUuid: input.actorAccountUuid,
    permission: ["championship:admin", "championship:operate"],
    championshipId: championship.id
  });

  return (
    await evaluateRosterMove(db, championship, {
      participantId: input.participantId,
      targetTeamId: input.targetTeamId,
      role: input.role
    })
  ).preview;
}

export async function executeChampionshipRosterMove(
  championshipUuid: string,
  input: ExecuteChampionshipRosterMoveInput
): Promise<ChampionshipRosterMembershipResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "roster.staff-moved"
    },
    async (tx, championship, actor) => {
      const applied = await applyChampionshipRosterMove(tx, championship, {
        ...input,
        acquisitionSource: "staff",
        actorAccountId: actor.account.id,
        allowCapException: input.confirmCapException
      });

      return {
        response: () => applied.membership,
        targetType: "roster-membership",
        targetUuid: applied.membership.uuid,
        before: applied.preview.source,
        after: applied.preview.target,
        reason: input.reason ?? null,
        metadata: {
          preview: applied.preview,
          approvedCapException: applied.preview.requiresCapException
        },
        outboxTopic: "championship.roster.changed"
      };
    }
  );
}

export async function reorderChampionshipRoster(
  championshipUuid: string,
  input: ReorderChampionshipRosterInput
): Promise<ChampionshipRosterOrderResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "roster.reordered"
    },
    async (tx, championship) => {
      const [team] = await tx
        .select()
        .from(championshipTeams)
        .where(
          and(
            eq(championshipTeams.championshipId, championship.id),
            eq(championshipTeams.uuid, input.teamId)
          )
        );
      if (!team) throw notFound("Championship team not found");

      const memberships = await tx
        .select({ membership: championshipTeamMemberships, participant: championshipParticipants })
        .from(championshipTeamMemberships)
        .innerJoin(
          championshipParticipants,
          eq(championshipTeamMemberships.participantId, championshipParticipants.id)
        )
        .where(
          and(
            eq(championshipTeamMemberships.teamId, team.id),
            isNull(championshipTeamMemberships.endedAt)
          )
        );
      const membershipByParticipantUuid = new Map(
        memberships.map(({ membership, participant }) => [participant.uuid, membership])
      );

      if (
        memberships.length !== input.participantIds.length ||
        input.participantIds.some((uuid) => !membershipByParticipantUuid.has(uuid))
      ) {
        throw conflict("Roster order must contain every active team participant exactly once");
      }

      for (const [displayOrder, participantUuid] of input.participantIds.entries()) {
        await tx
          .update(championshipTeamMemberships)
          .set({ displayOrder })
          .where(eq(championshipTeamMemberships.id, membershipByParticipantUuid.get(participantUuid)!.id));
      }

      const rosterRevision = team.rosterRevision + 1;
      await tx
        .update(championshipTeams)
        .set({ rosterRevision, revision: team.revision + 1, updatedAt: new Date().toISOString() })
        .where(eq(championshipTeams.id, team.id));
      const response = { teamUuid: team.uuid, rosterRevision, participantIds: input.participantIds };

      return {
        response: () => response,
        targetType: "championship-team",
        targetUuid: team.uuid,
        before: memberships
          .sort((left, right) => left.membership.displayOrder - right.membership.displayOrder)
          .map(({ participant }) => participant.uuid),
        after: input.participantIds,
        metadata: { teamUuid: team.uuid, participantCount: input.participantIds.length },
        outboxTopic: "championship.roster.reordered"
      };
    }
  );
}

export async function applyChampionshipRosterMove(
  tx: DbTransaction,
  championship: Championship,
  input: ApplyChampionshipRosterMoveInput
): Promise<AppliedChampionshipRosterMove> {
  const context = await evaluateRosterMove(tx, championship, input);
  const nonCapViolations = context.preview.violations.filter(
    (violation) => violation !== "O teto salarial seria excedido."
  );

  if (nonCapViolations.length > 0) {
    throw conflict("Roster move is invalid", {
      preview: context.preview
    });
  }

  if (context.preview.requiresCapException) {
    if (!input.allowCapException) {
      throw conflict("Roster move would exceed the salary cap", {
        preview: context.preview
      });
    }

    if (!input.reason?.trim()) {
      throw badRequest("A reason is required for a staff cap exception");
    }
  }

  const now = new Date().toISOString();
  const affectedTeams = [context.sourceTeam, context.targetTeam].filter(
    (team, index, teams): team is typeof championshipTeams.$inferSelect =>
      team !== null &&
      teams.findIndex((candidate) => candidate?.id === team.id) === index
  );
  const affectedTeamIds = affectedTeams.map(({ id }) => id);

  if (affectedTeamIds.length > 0) {
    await tx
      .update(championshipCapExceptions)
      .set({
        state: "expired",
        expiredAt: now
      })
      .where(
        and(
          inArray(championshipCapExceptions.teamId, affectedTeamIds),
          eq(championshipCapExceptions.state, "active")
        )
      );
  }

  const nextRosterRevisionByTeamId = new Map(
    affectedTeams.map((team) => [team.id, team.rosterRevision + 1])
  );

  if (context.sourceMembership && context.sourceTeam) {
    const sourceRevision = nextRosterRevisionByTeamId.get(
      context.sourceTeam.id
    )!;
    await tx
      .update(championshipTeamMemberships)
      .set({
        effectiveToRevision: sourceRevision,
        endedAt: now
      })
      .where(eq(championshipTeamMemberships.id, context.sourceMembership.id));
    await tx.insert(championshipSalaryLedgerEntries).values({
      championshipId: championship.id,
      teamId: context.sourceTeam.id,
      participantId: context.participant.id,
      membershipUuid: context.sourceMembership.uuid,
      amountUnits: -(context.sourceMembership.priceUnitsSnapshot ?? 0),
      kind: "membership-ended",
      rosterRevision: sourceRevision,
      actorAccountId: input.actorAccountId,
      reason: input.reason ?? null
    });
  }

  let resultMembership = context.sourceMembership;

  if (context.targetTeam) {
    const targetRevision = nextRosterRevisionByTeamId.get(
      context.targetTeam.id
    )!;
    const [createdMembership] = await tx
      .insert(championshipTeamMemberships)
      .values({
        championshipId: championship.id,
        teamId: context.targetTeam.id,
        participantId: context.participant.id,
        role: input.role ?? "player",
        acquisitionSource: input.acquisitionSource,
        acquisitionReferenceUuid: input.acquisitionReferenceUuid ?? null,
        priceUnitsSnapshot: championship.rules.salary.enabled
          ? context.price!.priceUnits
          : null,
        displayOrder: await nextRosterDisplayOrder(tx, context.targetTeam.id),
        effectiveFromRevision: targetRevision
      })
      .returning();
    await tx.insert(championshipSalaryLedgerEntries).values({
      championshipId: championship.id,
      teamId: context.targetTeam.id,
      participantId: context.participant.id,
      membershipUuid: createdMembership.uuid,
      amountUnits: createdMembership.priceUnitsSnapshot ?? 0,
      kind: "membership-added",
      rosterRevision: targetRevision,
      actorAccountId: input.actorAccountId,
      reason: input.reason ?? null
    });
    resultMembership = createdMembership;
  }

  for (const team of affectedTeams) {
    await tx
      .update(championshipTeams)
      .set({
        rosterRevision: nextRosterRevisionByTeamId.get(team.id)!,
        revision: team.revision + 1,
        updatedAt: now
      })
      .where(eq(championshipTeams.id, team.id));
  }

  if (context.preview.requiresCapException) {
    const overCapTeams = context.preview.affectedTeams.filter(
      ({ overCapAfter }) => overCapAfter
    );

    for (const affected of overCapTeams) {
      const team = affectedTeams.find(
        ({ uuid }) => uuid === affected.teamUuid
      )!;
      const rosterRevision = nextRosterRevisionByTeamId.get(team.id)!;
      await tx.insert(championshipCapExceptions).values({
        championshipId: championship.id,
        teamId: team.id,
        capUnitsSnapshot: championship.rules.salary.capUnits,
        usageUnitsSnapshot: affected.usageAfterUnits,
        rosterRevisionSnapshot: rosterRevision,
        approvedByAccountId: input.actorAccountId,
        reason: input.reason!,
        expiresAtRevision: rosterRevision + 1
      });
    }
  }

  if (!resultMembership) {
    throw badRequest("Participant is not currently rostered");
  }

  return {
    membership: await toRosterMembershipResponse(tx, resultMembership.uuid),
    preview: context.preview
  };
}

export async function applyChampionshipRosterExchange(
  tx: DbTransaction,
  championship: Championship,
  input: ApplyChampionshipRosterExchangeInput
): Promise<AppliedChampionshipRosterExchange> {
  if (input.items.length < 2) {
    throw badRequest("Roster exchanges require at least two participants");
  }

  const participantUuids = input.items.map(
    ({ participantId }) => participantId
  );

  if (new Set(participantUuids).size !== participantUuids.length) {
    throw badRequest("A participant cannot appear twice in one exchange");
  }

  const teamUuids = [
    ...new Set(
      input.items.flatMap(({ fromTeamId, toTeamId }) => [fromTeamId, toTeamId])
    )
  ];
  const teams = await tx
    .select()
    .from(championshipTeams)
    .where(
      and(
        eq(championshipTeams.championshipId, championship.id),
        inArray(championshipTeams.uuid, teamUuids)
      )
    );
  const teamByUuid = new Map(teams.map((team) => [team.uuid, team]));

  if (teamByUuid.size !== teamUuids.length) {
    throw notFound("Championship exchange team not found");
  }

  const participantRows = await tx
    .select({
      participant: championshipParticipants,
      membership: championshipTeamMemberships,
      team: championshipTeams,
      price: championshipParticipantPrices
    })
    .from(championshipParticipants)
    .leftJoin(
      championshipTeamMemberships,
      and(
        eq(
          championshipTeamMemberships.participantId,
          championshipParticipants.id
        ),
        isNull(championshipTeamMemberships.endedAt)
      )
    )
    .leftJoin(
      championshipTeams,
      eq(championshipTeamMemberships.teamId, championshipTeams.id)
    )
    .leftJoin(
      championshipParticipantPrices,
      and(
        eq(
          championshipParticipantPrices.participantId,
          championshipParticipants.id
        ),
        eq(championshipParticipantPrices.championshipId, championship.id)
      )
    )
    .where(
      and(
        eq(championshipParticipants.championshipId, championship.id),
        inArray(championshipParticipants.uuid, participantUuids)
      )
    );
  const rowByParticipantUuid = new Map(
    participantRows.map((row) => [row.participant.uuid, row])
  );
  const violations: string[] = [];

  for (const item of input.items) {
    const row = rowByParticipantUuid.get(item.participantId);

    if (!row) {
      violations.push(`Participante ${item.participantId} não encontrado.`);
      continue;
    }

    if (
      row.participant.status !== "active" ||
      !row.membership ||
      !row.team ||
      row.team.uuid !== item.fromTeamId
    ) {
      violations.push(
        `${row.participant.displayNameSnapshot} não pertence mais ao elenco de origem.`
      );
    } else if (row.membership.role !== "player") {
      violations.push(
        `${row.participant.displayNameSnapshot} é GM e não pode ser trocado como jogador.`
      );
    }

    const targetTeam = teamByUuid.get(item.toTeamId);

    if (!targetTeam || targetTeam.state !== "active") {
      violations.push(
        `O time de destino de ${row.participant.displayNameSnapshot} não está ativo.`
      );
    }

    if (
      championship.rules.salary.enabled &&
      (championship.priceState !== "locked" || !row.price?.frozenAt)
    ) {
      violations.push(
        `${row.participant.displayNameSnapshot} não possui valor congelado.`
      );
    }
  }

  if (violations.length > 0) {
    throw conflict("Roster exchange is invalid", { violations });
  }

  const usageRows = await tx
    .select({
      teamId: championshipTeams.id,
      rosterSize: count(championshipTeamMemberships.id),
      usageUnits: sql<number>`coalesce(sum(coalesce(${championshipTeamMemberships.priceUnitsSnapshot}, 0)), 0)`
    })
    .from(championshipTeams)
    .leftJoin(
      championshipTeamMemberships,
      and(
        eq(championshipTeamMemberships.teamId, championshipTeams.id),
        isNull(championshipTeamMemberships.endedAt)
      )
    )
    .where(
      inArray(
        championshipTeams.id,
        teams.map(({ id }) => id)
      )
    )
    .groupBy(championshipTeams.id);
  const usageByTeamId = new Map(
    usageRows.map((row) => [
      row.teamId,
      {
        rosterSize: Number(row.rosterSize),
        usageUnits: Number(row.usageUnits)
      }
    ])
  );
  const deltaByTeamId = new Map<
    number,
    { rosterSize: number; usageUnits: number }
  >();

  for (const item of input.items) {
    const row = rowByParticipantUuid.get(item.participantId)!;
    const sourceTeam = teamByUuid.get(item.fromTeamId)!;
    const targetTeam = teamByUuid.get(item.toTeamId)!;
    const priceUnits = championship.rules.salary.enabled
      ? row.price!.priceUnits
      : 0;
    const sourceDelta = deltaByTeamId.get(sourceTeam.id) ?? {
      rosterSize: 0,
      usageUnits: 0
    };
    const targetDelta = deltaByTeamId.get(targetTeam.id) ?? {
      rosterSize: 0,
      usageUnits: 0
    };

    sourceDelta.rosterSize -= 1;
    sourceDelta.usageUnits -= priceUnits;
    targetDelta.rosterSize += 1;
    targetDelta.usageUnits += priceUnits;
    deltaByTeamId.set(sourceTeam.id, sourceDelta);
    deltaByTeamId.set(targetTeam.id, targetDelta);
  }

  const teamPreviews = teams.map((team) => {
    const before = usageByTeamId.get(team.id) ?? {
      rosterSize: 0,
      usageUnits: 0
    };
    const delta = deltaByTeamId.get(team.id) ?? {
      rosterSize: 0,
      usageUnits: 0
    };
    const rosterSizeAfter = before.rosterSize + delta.rosterSize;
    const usageAfterUnits = before.usageUnits + delta.usageUnits;

    if (rosterSizeAfter > championship.rules.roster.maximumSize) {
      violations.push(`${team.name} excederia o tamanho máximo do elenco.`);
    }

    if (
      championship.rules.salary.enabled &&
      usageAfterUnits > championship.rules.salary.capUnits
    ) {
      violations.push(`${team.name} excederia o teto salarial.`);
    }

    return {
      teamUuid: team.uuid,
      teamName: team.name,
      rosterRevision: team.rosterRevision + 1,
      rosterSizeBefore: before.rosterSize,
      rosterSizeAfter,
      usageBeforeUnits: before.usageUnits,
      usageAfterUnits,
      remainingAfterUnits: championship.rules.salary.enabled
        ? championship.rules.salary.capUnits - usageAfterUnits
        : 0
    };
  });

  if (violations.length > 0) {
    throw conflict("Roster exchange is invalid", {
      violations,
      teams: teamPreviews
    });
  }

  const now = new Date().toISOString();
  await tx
    .update(championshipCapExceptions)
    .set({
      state: "expired",
      expiredAt: now
    })
    .where(
      and(
        inArray(
          championshipCapExceptions.teamId,
          teams.map(({ id }) => id)
        ),
        eq(championshipCapExceptions.state, "active")
      )
    );
  const nextRevisionByTeamId = new Map(
    teams.map((team) => [team.id, team.rosterRevision + 1])
  );

  for (const item of input.items) {
    const row = rowByParticipantUuid.get(item.participantId)!;
    const sourceTeam = teamByUuid.get(item.fromTeamId)!;
    const sourceRevision = nextRevisionByTeamId.get(sourceTeam.id)!;

    await tx
      .update(championshipTeamMemberships)
      .set({
        effectiveToRevision: sourceRevision,
        endedAt: now
      })
      .where(eq(championshipTeamMemberships.id, row.membership!.id));
    await tx.insert(championshipSalaryLedgerEntries).values({
      championshipId: championship.id,
      teamId: sourceTeam.id,
      participantId: row.participant.id,
      membershipUuid: row.membership!.uuid,
      amountUnits: -(row.membership!.priceUnitsSnapshot ?? 0),
      kind: "trade-out",
      rosterRevision: sourceRevision,
      actorAccountId: input.actorAccountId,
      reason: input.reason ?? null
    });
  }

  const createdMembershipUuids: string[] = [];

  for (const item of input.items) {
    const row = rowByParticipantUuid.get(item.participantId)!;
    const targetTeam = teamByUuid.get(item.toTeamId)!;
    const targetRevision = nextRevisionByTeamId.get(targetTeam.id)!;
    const [membership] = await tx
      .insert(championshipTeamMemberships)
      .values({
        championshipId: championship.id,
        teamId: targetTeam.id,
        participantId: row.participant.id,
        role: "player",
        acquisitionSource: "trade",
        acquisitionReferenceUuid: input.acquisitionReferenceUuid,
        priceUnitsSnapshot: championship.rules.salary.enabled
          ? row.price!.priceUnits
          : null,
        displayOrder: await nextRosterDisplayOrder(tx, targetTeam.id),
        effectiveFromRevision: targetRevision
      })
      .returning();
    createdMembershipUuids.push(membership.uuid);
    await tx.insert(championshipSalaryLedgerEntries).values({
      championshipId: championship.id,
      teamId: targetTeam.id,
      participantId: row.participant.id,
      membershipUuid: membership.uuid,
      amountUnits: membership.priceUnitsSnapshot ?? 0,
      kind: "trade-in",
      rosterRevision: targetRevision,
      actorAccountId: input.actorAccountId,
      reason: input.reason ?? null
    });
  }

  for (const team of teams) {
    await tx
      .update(championshipTeams)
      .set({
        rosterRevision: nextRevisionByTeamId.get(team.id)!,
        revision: team.revision + 1,
        updatedAt: now
      })
      .where(eq(championshipTeams.id, team.id));
  }

  return {
    memberships: await Promise.all(
      createdMembershipUuids.map((uuid) => toRosterMembershipResponse(tx, uuid))
    ),
    teams: teamPreviews
  };
}

export async function listChampionshipRosterHistory(
  championshipUuid: string,
  query: ChampionshipRosterHistoryQuery
): Promise<PaginatedResponse<ChampionshipRosterMembershipResponse>> {
  const [championship] = await db
    .select({ id: championships.id })
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  const cursor = decodeCursor<number>(query.cursor);
  const rows = await db
    .select({
      membership: championshipTeamMemberships,
      participant: championshipParticipants,
      team: championshipTeams
    })
    .from(championshipTeamMemberships)
    .innerJoin(
      championshipParticipants,
      eq(championshipTeamMemberships.participantId, championshipParticipants.id)
    )
    .innerJoin(
      championshipTeams,
      eq(championshipTeamMemberships.teamId, championshipTeams.id)
    )
    .where(
      and(
        eq(championshipTeamMemberships.championshipId, championship.id),
        query.participantId
          ? eq(championshipParticipants.uuid, query.participantId)
          : undefined,
        query.teamId ? eq(championshipTeams.uuid, query.teamId) : undefined,
        cursor === undefined
          ? undefined
          : gt(championshipTeamMemberships.id, cursor)
      )
    )
    .orderBy(asc(championshipTeamMemberships.id))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, ({ membership }) => membership.id);

  return {
    items: page.items.map(({ membership, participant, team }) =>
      mapRosterMembership(membership, participant, team)
    ),
    page: page.page
  };
}

async function evaluateRosterMove(
  database: DatabaseExecutor,
  championship: Championship,
  input: {
    participantId: string;
    targetTeamId: string | null;
    role?: "gm" | "player";
  }
): Promise<MoveContext> {
  const [participantRow] = await database
    .select({
      participant: championshipParticipants,
      price: championshipParticipantPrices,
      sourceMembership: championshipTeamMemberships,
      sourceTeam: championshipTeams
    })
    .from(championshipParticipants)
    .leftJoin(
      championshipParticipantPrices,
      and(
        eq(
          championshipParticipantPrices.participantId,
          championshipParticipants.id
        ),
        eq(championshipParticipantPrices.championshipId, championship.id)
      )
    )
    .leftJoin(
      championshipTeamMemberships,
      and(
        eq(
          championshipTeamMemberships.participantId,
          championshipParticipants.id
        ),
        isNull(championshipTeamMemberships.endedAt)
      )
    )
    .leftJoin(
      championshipTeams,
      eq(championshipTeamMemberships.teamId, championshipTeams.id)
    )
    .where(
      and(
        eq(championshipParticipants.championshipId, championship.id),
        eq(championshipParticipants.uuid, input.participantId)
      )
    );

  if (!participantRow) {
    throw notFound("Championship participant not found");
  }

  const [targetTeam] = input.targetTeamId
    ? await database
        .select()
        .from(championshipTeams)
        .where(
          and(
            eq(championshipTeams.championshipId, championship.id),
            eq(championshipTeams.uuid, input.targetTeamId)
          )
        )
    : [null];

  if (input.targetTeamId && !targetTeam) {
    throw notFound("Target championship team not found");
  }

  const role = input.role ?? "player";
  const violations: string[] = [];

  if (participantRow.participant.status !== "active") {
    violations.push("Apenas participantes ativos podem integrar um elenco.");
  }

  if (targetTeam?.state !== undefined && targetTeam.state !== "active") {
    violations.push("O time de destino não está ativo.");
  }

  if (
    participantRow.sourceTeam?.id === targetTeam?.id &&
    participantRow.sourceMembership?.role === role
  ) {
    violations.push("O participante já ocupa essa função nesse time.");
  }

  if (!targetTeam && !participantRow.sourceMembership) {
    violations.push("O participante já está sem time.");
  }

  if (championship.rules.salary.enabled) {
    if (championship.priceState !== "locked") {
      violations.push(
        "Os valores precisam estar congelados antes de alterar elencos."
      );
    }

    if (!participantRow.price?.frozenAt) {
      violations.push("O participante não possui um valor congelado.");
    }
  }

  const affectedTeams = [participantRow.sourceTeam, targetTeam].filter(
    (team, index, teams): team is typeof championshipTeams.$inferSelect =>
      team !== null &&
      teams.findIndex((candidate) => candidate?.id === team.id) === index
  );
  const usageByTeamId = new Map<
    number,
    { usageUnits: number; rosterSize: number }
  >();

  if (affectedTeams.length > 0) {
    const usageRows = await database
      .select({
        teamId: championshipTeams.id,
        rosterSize: count(championshipTeamMemberships.id),
        usageUnits: sql<number>`coalesce(sum(coalesce(${championshipTeamMemberships.priceUnitsSnapshot}, 0)), 0)`
      })
      .from(championshipTeams)
      .leftJoin(
        championshipTeamMemberships,
        and(
          eq(championshipTeamMemberships.teamId, championshipTeams.id),
          isNull(championshipTeamMemberships.endedAt)
        )
      )
      .where(
        inArray(
          championshipTeams.id,
          affectedTeams.map(({ id }) => id)
        )
      )
      .groupBy(championshipTeams.id);

    for (const usage of usageRows) {
      usageByTeamId.set(usage.teamId, {
        usageUnits: Number(usage.usageUnits),
        rosterSize: Number(usage.rosterSize)
      });
    }
  }

  const priceUnits = championship.rules.salary.enabled
    ? (participantRow.price?.priceUnits ?? 0)
    : 0;
  const affectedTeamPreviews = affectedTeams.map((team) => {
    const usage = usageByTeamId.get(team.id) ?? {
      usageUnits: 0,
      rosterSize: 0
    };
    const isSource = participantRow.sourceTeam?.id === team.id;
    const isTarget = targetTeam?.id === team.id;
    const changesTeam = participantRow.sourceTeam?.id !== targetTeam?.id;
    const usageAfterUnits =
      usage.usageUnits +
      (changesTeam && isSource ? -priceUnits : 0) +
      (changesTeam && isTarget ? priceUnits : 0);
    const rosterSizeAfter =
      usage.rosterSize +
      (changesTeam && isSource ? -1 : 0) +
      (changesTeam && isTarget ? 1 : 0);
    const overCapAfter =
      championship.rules.salary.enabled &&
      usageAfterUnits > championship.rules.salary.capUnits;

    if (isTarget && rosterSizeAfter > championship.rules.roster.maximumSize) {
      violations.push("O elenco de destino excederia o tamanho máximo.");
    }

    return {
      teamUuid: team.uuid,
      teamName: team.name,
      rosterRevision: team.rosterRevision,
      usageBeforeUnits: usage.usageUnits,
      usageAfterUnits,
      remainingAfterUnits: championship.rules.salary.capUnits - usageAfterUnits,
      rosterSizeBefore: usage.rosterSize,
      rosterSizeAfter,
      overCapAfter
    };
  });
  const requiresCapException = affectedTeamPreviews.some(
    ({ overCapAfter }) => overCapAfter
  );

  if (requiresCapException) {
    violations.push("O teto salarial seria excedido.");
  }

  return {
    preview: {
      participant: {
        uuid: participantRow.participant.uuid,
        displayName: participantRow.participant.displayNameSnapshot,
        priceUnits: championship.rules.salary.enabled
          ? (participantRow.price?.priceUnits ?? null)
          : null
      },
      source:
        participantRow.sourceMembership && participantRow.sourceTeam
          ? {
              teamUuid: participantRow.sourceTeam.uuid,
              teamName: participantRow.sourceTeam.name,
              role: participantRow.sourceMembership.role
            }
          : null,
      target: targetTeam
        ? {
            teamUuid: targetTeam.uuid,
            teamName: targetTeam.name,
            role
          }
        : null,
      valid: violations.length === 0,
      requiresCapException,
      violations,
      affectedTeams: affectedTeamPreviews
    },
    participant: participantRow.participant,
    price: participantRow.price,
    sourceMembership: participantRow.sourceMembership,
    sourceTeam: participantRow.sourceTeam,
    targetTeam
  };
}

async function toRosterMembershipResponse(
  database: DbTransaction,
  membershipUuid: string
): Promise<ChampionshipRosterMembershipResponse> {
  const [row] = await database
    .select({
      membership: championshipTeamMemberships,
      participant: championshipParticipants,
      team: championshipTeams
    })
    .from(championshipTeamMemberships)
    .innerJoin(
      championshipParticipants,
      eq(championshipTeamMemberships.participantId, championshipParticipants.id)
    )
    .innerJoin(
      championshipTeams,
      eq(championshipTeamMemberships.teamId, championshipTeams.id)
    )
    .where(eq(championshipTeamMemberships.uuid, membershipUuid));

  if (!row) {
    throw notFound("Championship roster membership not found");
  }

  return mapRosterMembership(row.membership, row.participant, row.team);
}

function mapRosterMembership(
  membership: typeof championshipTeamMemberships.$inferSelect,
  participant: typeof championshipParticipants.$inferSelect,
  team: typeof championshipTeams.$inferSelect
): ChampionshipRosterMembershipResponse {
  return {
    uuid: membership.uuid,
    participant: {
      uuid: participant.uuid,
      displayName: participant.displayNameSnapshot
    },
    team: {
      uuid: team.uuid,
      name: team.name
    },
    role: membership.role,
    acquisitionSource: membership.acquisitionSource,
    acquisitionReferenceUuid: membership.acquisitionReferenceUuid,
    priceUnitsSnapshot: membership.priceUnitsSnapshot,
    displayOrder: membership.displayOrder,
    effectiveFromRevision: membership.effectiveFromRevision,
    effectiveToRevision: membership.effectiveToRevision,
    startedAt: membership.startedAt,
    endedAt: membership.endedAt
  };
}

async function nextRosterDisplayOrder(database: DatabaseExecutor, teamId: number) {
  const [row] = await database
    .select({ value: sql<number>`coalesce(max(${championshipTeamMemberships.displayOrder}), -1)` })
    .from(championshipTeamMemberships)
    .where(
      and(
        eq(championshipTeamMemberships.teamId, teamId),
        isNull(championshipTeamMemberships.endedAt)
      )
    );
  return Number(row?.value ?? -1) + 1;
}
