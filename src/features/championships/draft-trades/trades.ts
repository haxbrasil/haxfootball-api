import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  type DatabaseExecutor,
  withDatabaseTransaction
} from "@/db/client";
import { accounts } from "@/features/accounts/db";
import type {
  CreateChampionshipTradeInput,
  DecideChampionshipTradeInput,
  ListChampionshipTradesQuery,
  UpdateChampionshipTradeWindowInput
} from "@/features/championships/_shared/http/inputs";
import type {
  ChampionshipDetailResponse,
  ChampionshipTradeResponse
} from "@/features/championships/_shared/http/responses";
import { getChampionshipDetailFrom } from "@/features/championships/_shared/db/queries";
import {
  championshipActorHasPermission,
  findChampionshipActor,
  type ChampionshipActor
} from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  championshipAuditEvents,
  championshipOutboxEvents,
  championships,
  type Championship
} from "@/features/championships/core/db";
import {
  championshipTradeItems,
  championshipTrades,
  type ChampionshipTrade
} from "@/features/championships/draft-trades/db";
import { championshipParticipantPrices } from "@/features/championships/finance/db";
import {
  championshipParticipants,
  championshipTeamMemberships,
  championshipTeams
} from "@/features/championships/people/db";
import { applyChampionshipRosterExchange } from "@/features/championships/people/rosters";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "@/shared/http/errors";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse
} from "@lib";

type TradeProjectionActor = {
  actor: ChampionshipActor | null;
  canManage: boolean;
  gmTeamIds: number[];
};

type PreparedTradeItem = {
  participant: typeof championshipParticipants.$inferSelect;
  membership: typeof championshipTeamMemberships.$inferSelect;
  sourceTeam: typeof championshipTeams.$inferSelect;
  targetTeam: typeof championshipTeams.$inferSelect;
  frozenPriceUnits: number;
};

export async function listChampionshipTrades(
  championshipUuid: string,
  query: ListChampionshipTradesQuery = {}
): Promise<PaginatedResponse<ChampionshipTradeResponse>> {
  await expireDueChampionshipTrades(championshipUuid);
  const [championship] = await db
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  const visibility = query.visibility ?? "public";
  const actorContext = await resolveTradeProjectionActor(
    db,
    championship,
    query.actorAccountUuid
  );

  if (visibility === "admin" && !actorContext.canManage) {
    throw forbidden("Championship staff authority is required");
  }

  if (
    visibility === "involved" &&
    !actorContext.canManage &&
    actorContext.gmTeamIds.length === 0
  ) {
    throw forbidden("An active GM assignment is required");
  }

  const cursor = decodeCursor<number>(query.cursor);
  const rows = await db
    .select()
    .from(championshipTrades)
    .where(
      and(
        eq(championshipTrades.championshipId, championship.id),
        query.state ? eq(championshipTrades.state, query.state) : undefined,
        visibility === "public"
          ? eq(championshipTrades.state, "accepted")
          : visibility === "involved" && !actorContext.canManage
            ? or(
                inArray(
                  championshipTrades.proposingTeamId,
                  actorContext.gmTeamIds
                ),
                inArray(
                  championshipTrades.receivingTeamId,
                  actorContext.gmTeamIds
                )
              )
            : undefined,
        cursor === undefined ? undefined : gt(championshipTrades.id, cursor)
      )
    )
    .orderBy(asc(championshipTrades.id))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, ({ id }) => id);

  return {
    items: await projectTrades(
      db,
      page.items,
      actorContext,
      visibility === "public",
      isTradeWindowOpen(championship)
    ),
    page: page.page
  };
}

export async function updateChampionshipTradeWindow(
  championshipUuid: string,
  input: UpdateChampionshipTradeWindowInput
): Promise<ChampionshipDetailResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action:
        input.state === "open" ? "trade-window.opened" : "trade-window.closed"
    },
    async (tx, championship) => {
      if (championship.tradeWindowState === input.state) {
        throw badRequest(
          input.state === "open"
            ? "The trade window is already open"
            : "The trade window is already closed"
        );
      }

      if (
        input.state === "open" &&
        !["setup", "active"].includes(championship.lifecycle)
      ) {
        throw conflict(
          "The trade window can only be opened while the championship is in setup or active competition"
        );
      }

      const [updated] = await tx
        .update(championships)
        .set({
          tradeWindowState: input.state,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championships.id, championship.id))
        .returning();

      const detail = await getChampionshipDetailFrom(
        tx,
        championship.uuid,
        true
      );

      return {
        response: () => detail,
        targetType: "championship-trade-window",
        targetUuid: championship.uuid,
        before: { state: championship.tradeWindowState },
        after: { state: updated.tradeWindowState },
        reason: input.reason ?? null,
        metadata: {
          pendingTradesRemainActionable: true
        },
        outboxTopic: "championship.trade-window.changed"
      };
    }
  );
}

export async function createChampionshipTrade(
  championshipUuid: string,
  input: CreateChampionshipTradeInput
): Promise<ChampionshipTradeResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      authorize: async () => undefined,
      action: "trade.proposed"
    },
    async (tx, championship, actor) => {
      requireTradeWindowOpen(championship);

      if (input.proposingTeamId === input.receivingTeamId) {
        throw badRequest("Trade teams must be different");
      }

      if (input.deadlineAt && input.deadlineAt <= new Date().toISOString()) {
        throw badRequest("Trade deadline must be in the future");
      }

      const [proposingTeam, receivingTeam] = await resolveTradeTeams(
        tx,
        championship.id,
        input.proposingTeamId,
        input.receivingTeamId
      );
      const actorContext = await resolveTradeProjectionActor(
        tx,
        championship,
        actor.account.uuid
      );

      if (
        !actorContext.canManage &&
        !actorContext.gmTeamIds.includes(proposingTeam.id)
      ) {
        throw forbidden("Only an active proposing-team GM can open a trade");
      }

      const prepared = await prepareTradeItems(tx, championship, {
        proposingTeam,
        receivingTeam,
        proposingParticipantIds: input.proposingParticipantIds,
        receivingParticipantIds: input.receivingParticipantIds
      });
      const proposingValueUnits = prepared
        .filter(({ sourceTeam }) => sourceTeam.id === proposingTeam.id)
        .reduce((sum, item) => sum + item.frozenPriceUnits, 0);
      const receivingValueUnits = prepared
        .filter(({ sourceTeam }) => sourceTeam.id === receivingTeam.id)
        .reduce((sum, item) => sum + item.frozenPriceUnits, 0);
      const difference = Math.abs(proposingValueUnits - receivingValueUnits);

      if (difference > championship.rules.salary.maximumTradeDifference) {
        throw conflict("Trade value difference exceeds the configured limit", {
          proposingValueUnits,
          receivingValueUnits,
          differenceUnits: difference,
          maximumDifferenceUnits:
            championship.rules.salary.maximumTradeDifference
        });
      }

      await validateProjectedTradeRosters(
        tx,
        championship,
        proposingTeam,
        receivingTeam,
        prepared
      );
      const now = new Date().toISOString();
      const [trade] = await tx
        .insert(championshipTrades)
        .values({
          championshipId: championship.id,
          proposingTeamId: proposingTeam.id,
          receivingTeamId: receivingTeam.id,
          proposerAccountId: actor.account.id,
          proposingValueUnits,
          receivingValueUnits,
          maximumDifferenceUnitsSnapshot:
            championship.rules.salary.maximumTradeDifference,
          deadlineAt: input.deadlineAt ?? null,
          proposedAt: now,
          createdAt: now,
          updatedAt: now
        })
        .returning();
      await tx.insert(championshipTradeItems).values(
        prepared.map((item) => ({
          tradeId: trade.id,
          participantId: item.participant.id,
          fromTeamId: item.sourceTeam.id,
          toTeamId: item.targetTeam.id,
          frozenPriceUnits: item.frozenPriceUnits
        }))
      );
      const [response] = await projectTrades(
        tx,
        [trade],
        actorContext,
        false,
        true
      );

      return {
        response: () => response!,
        targetType: "trade",
        targetUuid: trade.uuid,
        before: null,
        after: {
          state: trade.state,
          proposingTeamUuid: proposingTeam.uuid,
          receivingTeamUuid: receivingTeam.uuid,
          proposingValueUnits,
          receivingValueUnits,
          differenceUnits: difference
        },
        outboxTopic: "championship.trade.proposed"
      };
    }
  );
}

export async function acceptChampionshipTrade(
  championshipUuid: string,
  tradeUuid: string,
  input: DecideChampionshipTradeInput
): Promise<ChampionshipTradeResponse> {
  await expireDueChampionshipTrades(championshipUuid);

  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      authorize: async () => undefined,
      action: "trade.accepted"
    },
    async (tx, championship, actor) => {
      requireTradeWindowOpen(championship);
      const trade = await requireTrade(tx, championship.id, tradeUuid);
      requireTradeRevision(trade, input.expectedTradeRevision);
      requireProposedTrade(trade);
      const actorContext = await resolveTradeProjectionActor(
        tx,
        championship,
        actor.account.uuid
      );

      if (
        !actorContext.canManage &&
        !actorContext.gmTeamIds.includes(trade.receivingTeamId)
      ) {
        throw forbidden("Only an active receiving-team GM can accept a trade");
      }

      const itemRows = await tx
        .select({
          item: championshipTradeItems,
          participant: championshipParticipants,
          fromTeam: championshipTeams
        })
        .from(championshipTradeItems)
        .innerJoin(
          championshipParticipants,
          eq(championshipTradeItems.participantId, championshipParticipants.id)
        )
        .innerJoin(
          championshipTeams,
          eq(championshipTradeItems.fromTeamId, championshipTeams.id)
        )
        .where(eq(championshipTradeItems.tradeId, trade.id));
      const teamRows = await tx
        .select()
        .from(championshipTeams)
        .where(
          inArray(championshipTeams.id, [
            trade.proposingTeamId,
            trade.receivingTeamId
          ])
        );
      const teamById = new Map(teamRows.map((team) => [team.id, team]));
      const difference = Math.abs(
        trade.proposingValueUnits - trade.receivingValueUnits
      );

      if (difference > trade.maximumDifferenceUnitsSnapshot) {
        throw conflict("Trade value difference is no longer valid");
      }

      const applied = await applyChampionshipRosterExchange(tx, championship, {
        items: itemRows.map(({ item, participant, fromTeam }) => ({
          participantId: participant.uuid,
          fromTeamId: fromTeam.uuid,
          toTeamId: teamById.get(item.toTeamId)!.uuid
        })),
        acquisitionReferenceUuid: trade.uuid,
        actorAccountId: actor.account.id,
        reason: input.reason ?? null
      });
      const now = new Date().toISOString();
      const [accepted] = await tx
        .update(championshipTrades)
        .set({
          state: "accepted",
          decidedByAccountId: actor.account.id,
          decidedAt: now,
          revision: trade.revision + 1,
          updatedAt: now
        })
        .where(
          and(
            eq(championshipTrades.id, trade.id),
            eq(championshipTrades.state, "proposed"),
            eq(championshipTrades.revision, input.expectedTradeRevision)
          )
        )
        .returning();

      if (!accepted) {
        throw conflict("Trade changed before it could be accepted");
      }

      const [response] = await projectTrades(
        tx,
        [accepted],
        actorContext,
        false,
        true
      );

      return {
        response: () => response!,
        targetType: "trade",
        targetUuid: trade.uuid,
        before: { state: trade.state, revision: trade.revision },
        after: {
          state: accepted.state,
          revision: accepted.revision,
          memberships: applied.memberships.map(({ uuid }) => uuid)
        },
        reason: input.reason ?? null,
        metadata: {
          teams: applied.teams
        },
        outboxTopic: "championship.trade.accepted"
      };
    }
  );
}

export async function rejectChampionshipTrade(
  championshipUuid: string,
  tradeUuid: string,
  input: DecideChampionshipTradeInput
): Promise<ChampionshipTradeResponse> {
  return decideChampionshipTrade(
    championshipUuid,
    tradeUuid,
    input,
    "rejected"
  );
}

export async function cancelChampionshipTrade(
  championshipUuid: string,
  tradeUuid: string,
  input: DecideChampionshipTradeInput
): Promise<ChampionshipTradeResponse> {
  return decideChampionshipTrade(
    championshipUuid,
    tradeUuid,
    input,
    "canceled"
  );
}

async function decideChampionshipTrade(
  championshipUuid: string,
  tradeUuid: string,
  input: DecideChampionshipTradeInput,
  decision: "rejected" | "canceled"
): Promise<ChampionshipTradeResponse> {
  await expireDueChampionshipTrades(championshipUuid);

  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      authorize: async () => undefined,
      action: `trade.${decision}`
    },
    async (tx, championship, actor) => {
      const trade = await requireTrade(tx, championship.id, tradeUuid);
      requireTradeRevision(trade, input.expectedTradeRevision);
      requireProposedTrade(trade);
      const actorContext = await resolveTradeProjectionActor(
        tx,
        championship,
        actor.account.uuid
      );
      const authorized =
        actorContext.canManage ||
        (decision === "rejected"
          ? actorContext.gmTeamIds.includes(trade.receivingTeamId)
          : actorContext.gmTeamIds.includes(trade.proposingTeamId));

      if (!authorized) {
        throw forbidden(
          decision === "rejected"
            ? "Only an active receiving-team GM can reject a trade"
            : "Only an active proposing-team GM can cancel a trade"
        );
      }

      const now = new Date().toISOString();
      const [updated] = await tx
        .update(championshipTrades)
        .set({
          state: decision,
          decidedByAccountId: actor.account.id,
          decidedAt: now,
          revision: trade.revision + 1,
          updatedAt: now
        })
        .where(
          and(
            eq(championshipTrades.id, trade.id),
            eq(championshipTrades.state, "proposed"),
            eq(championshipTrades.revision, input.expectedTradeRevision)
          )
        )
        .returning();

      if (!updated) {
        throw conflict("Trade changed before the decision was applied");
      }

      const [response] = await projectTrades(
        tx,
        [updated],
        actorContext,
        false,
        isTradeWindowOpen(championship)
      );

      return {
        response: () => response!,
        targetType: "trade",
        targetUuid: trade.uuid,
        before: { state: trade.state, revision: trade.revision },
        after: { state: updated.state, revision: updated.revision },
        reason: input.reason ?? null,
        outboxTopic: `championship.trade.${decision}`
      };
    }
  );
}

async function prepareTradeItems(
  database: DatabaseExecutor,
  championship: Championship,
  input: {
    proposingTeam: typeof championshipTeams.$inferSelect;
    receivingTeam: typeof championshipTeams.$inferSelect;
    proposingParticipantIds: string[];
    receivingParticipantIds: string[];
  }
): Promise<PreparedTradeItem[]> {
  const allParticipantIds = [
    ...input.proposingParticipantIds,
    ...input.receivingParticipantIds
  ];

  if (new Set(allParticipantIds).size !== allParticipantIds.length) {
    throw badRequest("A participant cannot appear on both sides of a trade");
  }

  if (
    championship.rules.salary.enabled &&
    championship.priceState !== "locked"
  ) {
    throw conflict("Participant values must be frozen before trading");
  }

  const rows = await database
    .select({
      participant: championshipParticipants,
      membership: championshipTeamMemberships,
      sourceTeam: championshipTeams,
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
        inArray(championshipParticipants.uuid, allParticipantIds)
      )
    );
  const rowByUuid = new Map(rows.map((row) => [row.participant.uuid, row]));

  if (rowByUuid.size !== allParticipantIds.length) {
    throw notFound("Trade participant not found");
  }

  const prepared = allParticipantIds.map((participantUuid) => {
    const row = rowByUuid.get(participantUuid)!;
    const proposingSide =
      input.proposingParticipantIds.includes(participantUuid);
    const expectedSource = proposingSide
      ? input.proposingTeam
      : input.receivingTeam;
    const targetTeam = proposingSide
      ? input.receivingTeam
      : input.proposingTeam;

    if (
      row.participant.status !== "active" ||
      !row.membership ||
      !row.sourceTeam ||
      row.sourceTeam.id !== expectedSource.id
    ) {
      throw conflict(
        `${row.participant.displayNameSnapshot} does not belong to the expected team`
      );
    }

    if (row.membership.role !== "player") {
      throw conflict("GM memberships cannot be included in player trades");
    }

    if (championship.rules.salary.enabled && !row.price?.frozenAt) {
      throw conflict(
        `${row.participant.displayNameSnapshot} has no frozen championship value`
      );
    }

    return {
      participant: row.participant,
      membership: row.membership,
      sourceTeam: row.sourceTeam,
      targetTeam,
      frozenPriceUnits: championship.rules.salary.enabled
        ? row.price!.priceUnits
        : 0
    };
  });

  return prepared;
}

async function validateProjectedTradeRosters(
  database: DatabaseExecutor,
  championship: Championship,
  proposingTeam: typeof championshipTeams.$inferSelect,
  receivingTeam: typeof championshipTeams.$inferSelect,
  items: PreparedTradeItem[]
): Promise<void> {
  const teams = [proposingTeam, receivingTeam];
  const currentRows = await database
    .select({
      teamId: championshipTeams.id,
      rosterSize: sql<number>`count(${championshipTeamMemberships.id})`,
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
  const currentByTeamId = new Map(
    currentRows.map((row) => [
      row.teamId,
      {
        rosterSize: Number(row.rosterSize),
        usageUnits: Number(row.usageUnits)
      }
    ])
  );
  const violations: string[] = [];
  const projections = teams.map((team) => {
    const before = currentByTeamId.get(team.id) ?? {
      rosterSize: 0,
      usageUnits: 0
    };
    const outgoing = items.filter(
      ({ sourceTeam }) => sourceTeam.id === team.id
    );
    const incoming = items.filter(
      ({ targetTeam }) => targetTeam.id === team.id
    );
    const rosterSizeAfter =
      before.rosterSize - outgoing.length + incoming.length;
    const usageAfterUnits =
      before.usageUnits -
      outgoing.reduce((sum, item) => sum + item.frozenPriceUnits, 0) +
      incoming.reduce((sum, item) => sum + item.frozenPriceUnits, 0);

    if (rosterSizeAfter > championship.rules.roster.maximumSize) {
      violations.push(`${team.name} would exceed its maximum roster size`);
    }

    if (
      championship.rules.salary.enabled &&
      usageAfterUnits > championship.rules.salary.capUnits
    ) {
      violations.push(`${team.name} would exceed the salary cap`);
    }

    return {
      teamUuid: team.uuid,
      rosterSizeAfter,
      usageAfterUnits,
      remainingAfterUnits: championship.rules.salary.enabled
        ? championship.rules.salary.capUnits - usageAfterUnits
        : 0
    };
  });

  if (violations.length > 0) {
    throw conflict("Trade would create invalid rosters", {
      violations,
      projections
    });
  }
}

async function projectTrades(
  database: DatabaseExecutor,
  trades: ChampionshipTrade[],
  actorContext: TradeProjectionActor,
  publicProjection: boolean,
  tradeWindowOpen: boolean
): Promise<ChampionshipTradeResponse[]> {
  if (trades.length === 0) {
    return [];
  }

  const teamIds = [
    ...new Set(
      trades.flatMap(({ proposingTeamId, receivingTeamId }) => [
        proposingTeamId,
        receivingTeamId
      ])
    )
  ];
  const accountIds = [
    ...new Set(
      trades.flatMap(({ proposerAccountId, decidedByAccountId }) => [
        proposerAccountId,
        ...(decidedByAccountId ? [decidedByAccountId] : [])
      ])
    )
  ];
  const [teams, accountRows, items] = await Promise.all([
    database
      .select()
      .from(championshipTeams)
      .where(inArray(championshipTeams.id, teamIds)),
    database.select().from(accounts).where(inArray(accounts.id, accountIds)),
    database
      .select({
        item: championshipTradeItems,
        participant: championshipParticipants
      })
      .from(championshipTradeItems)
      .innerJoin(
        championshipParticipants,
        eq(championshipTradeItems.participantId, championshipParticipants.id)
      )
      .where(
        inArray(
          championshipTradeItems.tradeId,
          trades.map(({ id }) => id)
        )
      )
      .orderBy(asc(championshipTradeItems.id))
  ]);
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const accountById = new Map(
    accountRows.map((account) => [account.id, account])
  );

  return trades.map((trade) => {
    const proposingTeam = teamById.get(trade.proposingTeamId)!;
    const receivingTeam = teamById.get(trade.receivingTeamId)!;
    const proposer = accountById.get(trade.proposerAccountId)!;
    const decidedBy = trade.decidedByAccountId
      ? accountById.get(trade.decidedByAccountId)!
      : null;
    const canAccept =
      !publicProjection &&
      tradeWindowOpen &&
      trade.state === "proposed" &&
      (actorContext.canManage ||
        actorContext.gmTeamIds.includes(trade.receivingTeamId));
    const canCancel =
      !publicProjection &&
      trade.state === "proposed" &&
      (actorContext.canManage ||
        actorContext.gmTeamIds.includes(trade.proposingTeamId));
    const canReject =
      !publicProjection &&
      trade.state === "proposed" &&
      (actorContext.canManage ||
        actorContext.gmTeamIds.includes(trade.receivingTeamId));

    return {
      uuid: trade.uuid,
      state: trade.state,
      proposingTeam: {
        uuid: proposingTeam.uuid,
        name: proposingTeam.name
      },
      receivingTeam: {
        uuid: receivingTeam.uuid,
        name: receivingTeam.name
      },
      proposingValueUnits: trade.proposingValueUnits,
      receivingValueUnits: trade.receivingValueUnits,
      valueDifferenceUnits: Math.abs(
        trade.proposingValueUnits - trade.receivingValueUnits
      ),
      maximumDifferenceUnitsSnapshot: trade.maximumDifferenceUnitsSnapshot,
      items: items
        .filter(({ item }) => item.tradeId === trade.id)
        .map(({ item, participant }) => ({
          participant: {
            uuid: participant.uuid,
            displayName: participant.displayNameSnapshot
          },
          fromTeamUuid: teamById.get(item.fromTeamId)!.uuid,
          toTeamUuid: teamById.get(item.toTeamId)!.uuid,
          frozenPriceUnits: item.frozenPriceUnits
        })),
      proposer: {
        accountUuid: proposer.uuid,
        name: proposer.name
      },
      decidedBy: decidedBy
        ? {
            accountUuid: decidedBy.uuid,
            name: decidedBy.name
          }
        : null,
      proposedAt: trade.proposedAt,
      deadlineAt: trade.deadlineAt,
      decidedAt: trade.decidedAt,
      revision: trade.revision,
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt,
      actorActions: {
        canAccept,
        canReject,
        canCancel
      }
    };
  });
}

function isTradeWindowOpen(championship: Championship): boolean {
  return (
    championship.tradeWindowState === "open" &&
    ["setup", "active"].includes(championship.lifecycle)
  );
}

function requireTradeWindowOpen(championship: Championship): void {
  if (!isTradeWindowOpen(championship)) {
    throw conflict("The championship trade window is closed", {
      tradeWindowState: championship.tradeWindowState,
      lifecycle: championship.lifecycle
    });
  }
}

async function resolveTradeProjectionActor(
  database: DatabaseExecutor,
  championship: Championship,
  actorAccountUuid: string | undefined
): Promise<TradeProjectionActor> {
  if (!actorAccountUuid) {
    return {
      actor: null,
      canManage: false,
      gmTeamIds: []
    };
  }

  const actor = await findChampionshipActor(database, actorAccountUuid);
  const canManage = await championshipActorHasPermission(database, actor, {
    permission: ["championship:admin", "championship:operate"],
    championshipId: championship.id
  });
  const gmRows = await database
    .select({ teamId: championshipTeamMemberships.teamId })
    .from(championshipParticipants)
    .innerJoin(
      championshipTeamMemberships,
      and(
        eq(
          championshipTeamMemberships.participantId,
          championshipParticipants.id
        ),
        eq(championshipTeamMemberships.role, "gm"),
        isNull(championshipTeamMemberships.endedAt)
      )
    )
    .where(
      and(
        eq(championshipParticipants.championshipId, championship.id),
        eq(championshipParticipants.accountId, actor.account.id)
      )
    );

  return {
    actor,
    canManage,
    gmTeamIds: gmRows.map(({ teamId }) => teamId)
  };
}

async function resolveTradeTeams(
  database: DatabaseExecutor,
  championshipId: number,
  proposingTeamUuid: string,
  receivingTeamUuid: string
): Promise<
  [typeof championshipTeams.$inferSelect, typeof championshipTeams.$inferSelect]
> {
  const rows = await database
    .select()
    .from(championshipTeams)
    .where(
      and(
        eq(championshipTeams.championshipId, championshipId),
        inArray(championshipTeams.uuid, [proposingTeamUuid, receivingTeamUuid]),
        eq(championshipTeams.state, "active")
      )
    );
  const byUuid = new Map(rows.map((team) => [team.uuid, team]));
  const proposingTeam = byUuid.get(proposingTeamUuid);
  const receivingTeam = byUuid.get(receivingTeamUuid);

  if (!proposingTeam || !receivingTeam) {
    throw notFound("Active championship trade team not found");
  }

  return [proposingTeam, receivingTeam];
}

async function requireTrade(
  database: DatabaseExecutor,
  championshipId: number,
  tradeUuid: string
): Promise<ChampionshipTrade> {
  const [trade] = await database
    .select()
    .from(championshipTrades)
    .where(
      and(
        eq(championshipTrades.championshipId, championshipId),
        eq(championshipTrades.uuid, tradeUuid)
      )
    );

  if (!trade) {
    throw notFound("Championship trade not found");
  }

  return trade;
}

function requireTradeRevision(
  trade: ChampionshipTrade,
  expectedRevision: number
): void {
  if (trade.revision !== expectedRevision) {
    throw conflict("Trade revision does not match", {
      tradeUuid: trade.uuid,
      expectedRevision,
      currentRevision: trade.revision,
      state: trade.state
    });
  }
}

function requireProposedTrade(trade: ChampionshipTrade): void {
  if (trade.state !== "proposed") {
    throw conflict("Trade is no longer pending", {
      tradeUuid: trade.uuid,
      state: trade.state
    });
  }
}

async function expireDueChampionshipTrades(
  championshipUuid: string,
  now = new Date()
): Promise<number> {
  return withDatabaseTransaction(async (tx) => {
    const [championship] = await tx
      .select()
      .from(championships)
      .where(eq(championships.uuid, championshipUuid));

    if (!championship) {
      return 0;
    }

    const due = await tx
      .select()
      .from(championshipTrades)
      .where(
        and(
          eq(championshipTrades.championshipId, championship.id),
          eq(championshipTrades.state, "proposed"),
          lte(championshipTrades.deadlineAt, now.toISOString())
        )
      );

    if (due.length === 0) {
      return 0;
    }

    const changedAt = now.toISOString();
    await tx
      .update(championshipTrades)
      .set({
        state: "expired",
        decidedAt: changedAt,
        revision: sql`${championshipTrades.revision} + 1`,
        updatedAt: changedAt
      })
      .where(
        inArray(
          championshipTrades.id,
          due.map(({ id }) => id)
        )
      );
    const sequence = championship.changeSequence + 1;
    const revision = championship.revision + 1;
    await tx
      .update(championships)
      .set({
        revision,
        changeSequence: sequence,
        updatedAt: changedAt
      })
      .where(eq(championships.id, championship.id));
    const [audit] = await tx
      .insert(championshipAuditEvents)
      .values({
        championshipId: championship.id,
        sequence,
        correlationUuid: crypto.randomUUID(),
        actorKind: "system",
        action: "trades.expired",
        source: "request",
        targetType: "trade-set",
        before: {
          proposedTradeIds: due.map(({ uuid }) => uuid)
        },
        after: {
          expiredTradeIds: due.map(({ uuid }) => uuid)
        }
      })
      .returning();
    await tx.insert(championshipOutboxEvents).values({
      championshipId: championship.id,
      auditEventId: audit.id,
      topic: "championship.trades.expired",
      payload: {
        championshipUuid: championship.uuid,
        sequence,
        revision,
        action: "trades.expired",
        targetType: "trade-set",
        targetUuid: null
      }
    });

    return due.length;
  });
}
