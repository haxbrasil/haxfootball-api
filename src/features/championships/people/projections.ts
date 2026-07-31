import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, type DbTransaction } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { championships } from "@/features/championships/core/db";
import {
  championshipHistoricalPlayerIdentities,
  championshipParticipants,
  championshipTeamIdentities,
  championshipTeamMemberships,
  championshipTeams
} from "@/features/championships/people/db";
import { toTeamResponse } from "@/features/championships/_shared/db/queries";
import type { ListChampionshipParticipantsQuery } from "@/features/championships/_shared/http/inputs";
import type {
  ChampionshipParticipantResponse,
  ChampionshipTeamResponse
} from "@/features/championships/_shared/http/responses";
import { notFound } from "@/shared/http/errors";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

type Database = typeof db | DbTransaction;

export async function listChampionshipTeams(
  championshipUuid: string,
  query: PaginationQuery = {}
): Promise<PaginatedResponse<ChampionshipTeamResponse>> {
  const championshipId = await findChampionshipId(championshipUuid);
  const cursor = decodeCursor<number>(query.cursor);
  const rows = await db
    .select({
      team: championshipTeams,
      identity: championshipTeamIdentities
    })
    .from(championshipTeams)
    .leftJoin(
      championshipTeamIdentities,
      eq(championshipTeams.teamIdentityId, championshipTeamIdentities.id)
    )
    .where(
      and(
        eq(championshipTeams.championshipId, championshipId),
        cursor === undefined ? undefined : gt(championshipTeams.id, cursor)
      )
    )
    .orderBy(asc(championshipTeams.displayOrder), asc(championshipTeams.id))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, ({ team }) => team.id);

  return {
    items: page.items.map(({ team, identity }) =>
      toTeamResponse(team, identity)
    ),
    page: page.page
  };
}

export async function listChampionshipParticipants(
  championshipUuid: string,
  query: ListChampionshipParticipantsQuery = {}
): Promise<PaginatedResponse<ChampionshipParticipantResponse>> {
  const championshipId = await findChampionshipId(championshipUuid);
  const cursor = decodeCursor<number>(query.cursor);
  const rows = await selectParticipantRows(db, championshipId, {
    cursor,
    status: query.status,
    limit: pageLimit(query)
  });
  const page = pageItems(rows, query, ({ participant }) => participant.id);

  return {
    items: page.items.map(toParticipantResponse),
    page: page.page
  };
}

export async function getChampionshipParticipantFrom(
  database: Database,
  championshipId: number,
  participantUuid: string
): Promise<ChampionshipParticipantResponse> {
  const rows = await selectParticipantRows(database, championshipId, {
    participantUuid,
    limit: 1
  });
  const [row] = rows;

  if (!row) {
    throw notFound("Championship participant not found");
  }

  return toParticipantResponse(row);
}

function selectParticipantRows(
  database: Database,
  championshipId: number,
  input: {
    participantUuid?: string;
    cursor?: number;
    status?: ListChampionshipParticipantsQuery["status"];
    limit: number;
  }
) {
  const participantAccounts = alias(accounts, "participant_accounts");
  const linkedAccounts = alias(accounts, "historical_linked_accounts");

  return database
    .select({
      participant: championshipParticipants,
      account: participantAccounts,
      historicalIdentity: championshipHistoricalPlayerIdentities,
      linkedAccount: linkedAccounts,
      membership: championshipTeamMemberships,
      team: championshipTeams
    })
    .from(championshipParticipants)
    .leftJoin(
      participantAccounts,
      eq(championshipParticipants.accountId, participantAccounts.id)
    )
    .leftJoin(
      championshipHistoricalPlayerIdentities,
      eq(
        championshipParticipants.historicalPlayerIdentityId,
        championshipHistoricalPlayerIdentities.id
      )
    )
    .leftJoin(
      linkedAccounts,
      eq(
        championshipHistoricalPlayerIdentities.linkedAccountId,
        linkedAccounts.id
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
        eq(championshipParticipants.championshipId, championshipId),
        input.participantUuid
          ? eq(championshipParticipants.uuid, input.participantUuid)
          : undefined,
        input.cursor === undefined
          ? undefined
          : gt(championshipParticipants.id, input.cursor),
        input.status
          ? eq(championshipParticipants.status, input.status)
          : undefined
      )
    )
    .orderBy(asc(championshipParticipants.id))
    .limit(input.limit);
}

type ParticipantRow = Awaited<ReturnType<typeof selectParticipantRows>>[number];

function toParticipantResponse({
  participant,
  account,
  historicalIdentity,
  linkedAccount,
  membership,
  team
}: ParticipantRow): ChampionshipParticipantResponse {
  const identity: ChampionshipParticipantResponse["identity"] = account
    ? {
        kind: "account",
        accountUuid: account.uuid,
        name: account.name
      }
    : {
        kind: "historical",
        historicalIdentityUuid: historicalIdentity!.uuid,
        displayName: historicalIdentity!.displayName,
        aliases: historicalIdentity!.aliases,
        linkedAccount: linkedAccount
          ? {
              accountUuid: linkedAccount.uuid,
              name: linkedAccount.name
            }
          : null
      };

  return {
    uuid: participant.uuid,
    identity,
    displayName: participant.displayNameSnapshot,
    status: participant.status,
    origin: participant.origin,
    activeMembership:
      membership && team
        ? {
            uuid: membership.uuid,
            team: {
              uuid: team.uuid,
              name: team.name
            },
            role: membership.role,
            acquisitionSource: membership.acquisitionSource,
            priceUnitsSnapshot: membership.priceUnitsSnapshot,
            startedAt: membership.startedAt
          }
        : null,
    registeredAt: participant.registeredAt,
    registrationClosedAt: participant.registrationClosedAt,
    withdrawnAt: participant.withdrawnAt,
    revision: participant.revision,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt
  };
}

async function findChampionshipId(uuid: string): Promise<number> {
  const [championship] = await db
    .select({ id: championships.id })
    .from(championships)
    .where(eq(championships.uuid, uuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  return championship.id;
}
