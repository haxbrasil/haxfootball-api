import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { db, type DatabaseExecutor, type DbTransaction } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import type {
  AuthorizeChampionshipLatePlayInput,
  ChampionshipMatchSchedulingQuery,
  CreateChampionshipScheduleProposalInput,
  DecideChampionshipScheduleProposalInput,
  RemindChampionshipScheduleInput,
  RevokeChampionshipLatePlayInput
} from "@/features/championships/_shared/http/inputs";
import type { ChampionshipMatchSchedulingResponse } from "@/features/championships/_shared/http/responses";
import {
  championshipActorHasPermission,
  findChampionshipActor,
  type ChampionshipActor
} from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  championships,
  type Championship
} from "@/features/championships/core/db";
import { championshipInboxItems } from "@/features/championships/collaboration/db";
import {
  championshipCompetitionRounds,
  championshipLatePlayAuthorizations,
  championshipMatches,
  championshipScheduleProposals
} from "@/features/championships/format-scheduling/db";
import {
  championshipParticipants,
  championshipTeamMemberships,
  championshipTeams
} from "@/features/championships/people/db";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "@/shared/http/errors";

type SchedulingAccess = {
  actor: ChampionshipActor;
  kind: "staff" | "gm";
  team: typeof championshipTeams.$inferSelect | null;
  canPropose: boolean;
  canIntervene: boolean;
};

type SchedulingContext = {
  championship: Championship;
  match: typeof championshipMatches.$inferSelect;
  round: typeof championshipCompetitionRounds.$inferSelect | null;
  sideA: typeof championshipTeams.$inferSelect | null;
  sideB: typeof championshipTeams.$inferSelect | null;
  access: SchedulingAccess;
};

export async function getChampionshipMatchScheduling(
  championshipUuid: string,
  matchUuid: string,
  query: ChampionshipMatchSchedulingQuery
): Promise<ChampionshipMatchSchedulingResponse> {
  const context = await resolveSchedulingContext(
    db,
    championshipUuid,
    matchUuid,
    query.actorAccountUuid
  );

  return projectScheduling(db, context, query.limit ?? 100);
}

export async function createChampionshipScheduleProposal(
  championshipUuid: string,
  matchUuid: string,
  input: CreateChampionshipScheduleProposalInput
): Promise<ChampionshipMatchSchedulingResponse> {
  validateProposalShape(input);

  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      authorize: async (tx, championship, actor) => {
        const context = await resolveSchedulingContextByRows(
          tx,
          championship,
          matchUuid,
          actor
        );
        if (!context.access.canPropose) {
          throw forbidden("This actor cannot propose schedules for this match");
        }
      },
      action: "schedule.proposal.created"
    },
    async (tx, championship, actor) => {
      const context = await resolveSchedulingContextByRows(
        tx,
        championship,
        matchUuid,
        actor
      );
      requireScheduleRevision(
        context.match,
        input.expectedMatchScheduleRevision
      );
      validateProposalMode(championship, input.mode);

      const [pending] = await tx
        .select()
        .from(championshipScheduleProposals)
        .where(
          and(
            eq(
              championshipScheduleProposals.championshipMatchId,
              context.match.id
            ),
            eq(championshipScheduleProposals.state, "pending")
          )
        )
        .orderBy(asc(championshipScheduleProposals.id))
        .limit(1);

      let parent: typeof championshipScheduleProposals.$inferSelect | null =
        null;
      if (input.parentProposalId) {
        parent = await requireProposal(
          tx,
          context.match.id,
          input.parentProposalId
        );
        if (parent.state !== "pending") {
          throw conflict("Only a pending proposal can be countered", {
            proposalUuid: parent.uuid,
            currentState: parent.state
          });
        }
        if (
          input.expectedParentProposalRevision === null ||
          input.expectedParentProposalRevision === undefined
        ) {
          throw badRequest(
            "expectedParentProposalRevision is required for a counterproposal"
          );
        }
        requireProposalRevision(parent, input.expectedParentProposalRevision);
        if (context.access.kind === "gm") {
          if (parent.proposingTeamId === context.access.team?.id) {
            throw forbidden("A team cannot counter its own proposal");
          }
        }
      } else if (pending) {
        throw conflict("This match already has a pending proposal", {
          proposalUuid: pending.uuid,
          currentState: pending.state
        });
      }

      const now = new Date().toISOString();
      if (parent) {
        await tx
          .update(championshipScheduleProposals)
          .set({
            state: "countered",
            decidedByAccountId: actor.account.id,
            decidedAt: now,
            revision: parent.revision + 1,
            updatedAt: now
          })
          .where(eq(championshipScheduleProposals.id, parent.id));
      }

      const [proposal] = await tx
        .insert(championshipScheduleProposals)
        .values({
          championshipMatchId: context.match.id,
          parentProposalId: parent?.id ?? null,
          proposingTeamId: context.access.team?.id ?? null,
          proposingAccountId: actor.account.id,
          mode: input.mode,
          exactTime: input.mode === "exact-time" ? input.exactTime : null,
          availableFrom:
            input.mode === "availability-range" ? input.availableFrom : null,
          availableTo:
            input.mode === "availability-range" ? input.availableTo : null,
          note: input.note ?? null
        })
        .returning();

      await tx
        .update(championshipMatches)
        .set({
          scheduleStatus: "proposed",
          scheduleRevision: context.match.scheduleRevision + 1,
          revision: context.match.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipMatches.id, context.match.id));

      await notifyOpponentGms(tx, context, actor.account.id, {
        title: `New schedule proposal for ${context.match.label}`,
        body: input.note ?? null,
        dedupeKey: `schedule-proposal:${proposal.uuid}`
      });

      const nextContext = await resolveSchedulingContextByRows(
        tx,
        championship,
        matchUuid,
        actor
      );
      const response = await projectScheduling(tx, nextContext, 100);

      return {
        response: () => response,
        targetType: "schedule-proposal",
        targetUuid: proposal.uuid,
        before: parent,
        after: proposal,
        outboxTopic: "championship.schedule.changed"
      };
    }
  );
}

export async function decideChampionshipScheduleProposal(
  championshipUuid: string,
  matchUuid: string,
  proposalUuid: string,
  input: DecideChampionshipScheduleProposalInput
): Promise<ChampionshipMatchSchedulingResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      authorize: async (tx, championship, actor) => {
        await resolveSchedulingContextByRows(
          tx,
          championship,
          matchUuid,
          actor
        );
      },
      action: `schedule.proposal.${input.decision}`
    },
    async (tx, championship, actor) => {
      const context = await resolveSchedulingContextByRows(
        tx,
        championship,
        matchUuid,
        actor
      );
      const proposal = await requireProposal(
        tx,
        context.match.id,
        proposalUuid
      );
      requireScheduleRevision(
        context.match,
        input.expectedMatchScheduleRevision
      );
      requireProposalRevision(proposal, input.expectedProposalRevision);
      if (proposal.state !== "pending") {
        throw conflict("Only a pending schedule proposal can be decided", {
          proposalUuid,
          currentState: proposal.state
        });
      }

      authorizeProposalDecision(
        context,
        proposal,
        actor.account.id,
        input.decision
      );

      const now = new Date().toISOString();
      let scheduledAt: string | null = null;
      if (input.decision === "accept") {
        scheduledAt = acceptedScheduleTime(proposal, input.scheduledAt);
        await validateChampionshipScheduledTime(tx, context, scheduledAt);
      }

      const nextState =
        input.decision === "accept"
          ? "accepted"
          : input.decision === "reject"
            ? "rejected"
            : "withdrawn";
      const [updatedProposal] = await tx
        .update(championshipScheduleProposals)
        .set({
          state: nextState,
          decidedByAccountId: actor.account.id,
          decidedAt: now,
          note: input.reason ?? proposal.note,
          revision: proposal.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipScheduleProposals.id, proposal.id))
        .returning();

      if (input.decision === "accept") {
        const scheduleStatus = championshipScheduleStatusFor(
          context,
          scheduledAt!
        );
        await tx
          .update(championshipMatches)
          .set({
            scheduledAt,
            scheduleStatus,
            scheduleRevision: context.match.scheduleRevision + 1,
            revision: context.match.revision + 1,
            updatedAt: now
          })
          .where(eq(championshipMatches.id, context.match.id));
      } else {
        await tx
          .update(championshipMatches)
          .set({
            scheduleStatus: context.match.scheduledAt
              ? context.match.scheduleStatus
              : "unscheduled",
            scheduleRevision: context.match.scheduleRevision + 1,
            revision: context.match.revision + 1,
            updatedAt: now
          })
          .where(eq(championshipMatches.id, context.match.id));
      }

      await notifyMatchGms(tx, context, actor.account.id, {
        title:
          input.decision === "accept"
            ? `Schedule confirmed for ${context.match.label}`
            : `Schedule proposal ${
                input.decision === "withdraw"
                  ? "withdrawn"
                  : `${input.decision}ed`
              } for ${context.match.label}`,
        body: input.reason ?? null,
        dedupeKey: `schedule-decision:${updatedProposal.uuid}:${updatedProposal.revision}`
      });

      const nextContext = await resolveSchedulingContextByRows(
        tx,
        championship,
        matchUuid,
        actor
      );
      const response = await projectScheduling(tx, nextContext, 100);

      return {
        response: () => response,
        targetType: "schedule-proposal",
        targetUuid: proposal.uuid,
        before: proposal,
        after: updatedProposal,
        reason: input.reason ?? null,
        outboxTopic: "championship.schedule.changed"
      };
    }
  );
}

export async function authorizeChampionshipLatePlay(
  championshipUuid: string,
  matchUuid: string,
  input: AuthorizeChampionshipLatePlayInput
): Promise<ChampionshipMatchSchedulingResponse> {
  validateFutureExpiry(input.expiresAt);

  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "schedule.late-play.authorized"
    },
    async (tx, championship, actor) => {
      const context = await resolveSchedulingContextByRows(
        tx,
        championship,
        matchUuid,
        actor
      );
      requireScheduleRevision(
        context.match,
        input.expectedMatchScheduleRevision
      );
      if (
        (context.round?.latePlayPolicy ??
          championship.rules.scheduling.latePlayPolicy) === "forbidden"
      ) {
        throw forbidden("Late play is forbidden for this competition round");
      }

      const [authorization] = await tx
        .insert(championshipLatePlayAuthorizations)
        .values({
          championshipMatchId: context.match.id,
          authorizedByAccountId: actor.account.id,
          reason: input.reason,
          expiresAt: input.expiresAt ?? null
        })
        .returning();
      const now = new Date().toISOString();
      await tx
        .update(championshipMatches)
        .set({
          scheduleRevision: context.match.scheduleRevision + 1,
          revision: context.match.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipMatches.id, context.match.id));
      await notifyMatchGms(tx, context, actor.account.id, {
        title: `Late play authorized for ${context.match.label}`,
        body: input.reason,
        dedupeKey: `late-authorization:${authorization.uuid}`
      });

      const nextContext = await resolveSchedulingContextByRows(
        tx,
        championship,
        matchUuid,
        actor
      );
      const response = await projectScheduling(tx, nextContext, 100);
      return {
        response: () => response,
        targetType: "late-play-authorization",
        targetUuid: authorization.uuid,
        before: null,
        after: authorization,
        reason: input.reason,
        outboxTopic: "championship.schedule.changed"
      };
    }
  );
}

export async function revokeChampionshipLatePlay(
  championshipUuid: string,
  matchUuid: string,
  authorizationUuid: string,
  input: RevokeChampionshipLatePlayInput
): Promise<ChampionshipMatchSchedulingResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "schedule.late-play.revoked"
    },
    async (tx, championship, actor) => {
      const context = await resolveSchedulingContextByRows(
        tx,
        championship,
        matchUuid,
        actor
      );
      const [authorization] = await tx
        .select()
        .from(championshipLatePlayAuthorizations)
        .where(
          and(
            eq(championshipLatePlayAuthorizations.uuid, authorizationUuid),
            eq(
              championshipLatePlayAuthorizations.championshipMatchId,
              context.match.id
            )
          )
        );
      if (!authorization) {
        throw notFound("Late-play authorization not found");
      }
      if (authorization.revision !== input.expectedAuthorizationRevision) {
        throw conflict("Late-play authorization revision does not match", {
          authorizationUuid,
          expectedRevision: input.expectedAuthorizationRevision,
          currentRevision: authorization.revision
        });
      }
      if (authorization.revokedAt) {
        throw conflict("Late-play authorization is already revoked", {
          authorizationUuid
        });
      }

      const now = new Date().toISOString();
      const [updated] = await tx
        .update(championshipLatePlayAuthorizations)
        .set({
          revokedAt: now,
          revision: authorization.revision + 1
        })
        .where(eq(championshipLatePlayAuthorizations.id, authorization.id))
        .returning();
      await tx
        .update(championshipMatches)
        .set({
          scheduleRevision: context.match.scheduleRevision + 1,
          revision: context.match.revision + 1,
          updatedAt: now
        })
        .where(eq(championshipMatches.id, context.match.id));

      const nextContext = await resolveSchedulingContextByRows(
        tx,
        championship,
        matchUuid,
        actor
      );
      const response = await projectScheduling(tx, nextContext, 100);
      return {
        response: () => response,
        targetType: "late-play-authorization",
        targetUuid: authorization.uuid,
        before: authorization,
        after: updated,
        reason: input.reason,
        outboxTopic: "championship.schedule.changed"
      };
    }
  );
}

export async function remindChampionshipSchedule(
  championshipUuid: string,
  matchUuid: string,
  input: RemindChampionshipScheduleInput
): Promise<ChampionshipMatchSchedulingResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      authorize: async (tx, championship, actor) => {
        await resolveSchedulingContextByRows(
          tx,
          championship,
          matchUuid,
          actor
        );
      },
      action: "schedule.reminder.sent"
    },
    async (tx, championship, actor) => {
      const context = await resolveSchedulingContextByRows(
        tx,
        championship,
        matchUuid,
        actor
      );
      const recipientCount = await notifyOpponentGms(
        tx,
        context,
        actor.account.id,
        {
          title: `Schedule reminder for ${context.match.label}`,
          body: input.note ?? null,
          dedupeKey: `schedule-reminder:${input.commandUuid}`
        }
      );
      if (recipientCount === 0) {
        throw badRequest("No opposing GM can receive this reminder");
      }
      const response = await projectScheduling(tx, context, 100);
      return {
        response: () => response,
        targetType: "championship-match",
        targetUuid: context.match.uuid,
        before: null,
        after: { recipientCount },
        outboxTopic: "championship.schedule.reminder"
      };
    }
  );
}

async function resolveSchedulingContext(
  database: DatabaseExecutor,
  championshipUuid: string,
  matchUuid: string,
  actorAccountUuid: string
): Promise<SchedulingContext> {
  const [championship] = await database
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));
  if (!championship) {
    throw notFound("Championship not found");
  }
  const actor = await findChampionshipActor(database, actorAccountUuid);
  return resolveSchedulingContextByRows(
    database,
    championship,
    matchUuid,
    actor
  );
}

async function resolveSchedulingContextByRows(
  database: DatabaseExecutor,
  championship: Championship,
  matchUuid: string,
  actor: ChampionshipActor
): Promise<SchedulingContext> {
  const [match] = await database
    .select()
    .from(championshipMatches)
    .where(
      and(
        eq(championshipMatches.uuid, matchUuid),
        eq(championshipMatches.championshipId, championship.id)
      )
    );
  if (!match) {
    throw notFound("Championship match not found");
  }

  const teamIds = [match.sideATeamId, match.sideBTeamId].filter(
    (id): id is number => id !== null
  );
  const teams =
    teamIds.length === 0
      ? []
      : await database
          .select()
          .from(championshipTeams)
          .where(inArray(championshipTeams.id, teamIds));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const round = match.competitionRoundId
    ? ((
        await database
          .select()
          .from(championshipCompetitionRounds)
          .where(eq(championshipCompetitionRounds.id, match.competitionRoundId))
      )[0] ?? null)
    : null;
  const isStaff = await championshipActorHasPermission(database, actor, {
    permission: ["championship:admin", "championship:operate"],
    championshipId: championship.id
  });

  let gmTeam: typeof championshipTeams.$inferSelect | null = null;
  if (!isStaff && teamIds.length > 0) {
    const [membership] = await database
      .select({ teamId: championshipTeamMemberships.teamId })
      .from(championshipParticipants)
      .innerJoin(
        championshipTeamMemberships,
        and(
          eq(
            championshipTeamMemberships.participantId,
            championshipParticipants.id
          ),
          isNull(championshipTeamMemberships.endedAt),
          eq(championshipTeamMemberships.role, "gm")
        )
      )
      .where(
        and(
          eq(championshipParticipants.championshipId, championship.id),
          eq(championshipParticipants.accountId, actor.account.id),
          eq(championshipParticipants.status, "active"),
          inArray(championshipTeamMemberships.teamId, teamIds)
        )
      );
    gmTeam = membership ? (teamById.get(membership.teamId) ?? null) : null;
  }

  if (!isStaff && !gmTeam) {
    throw forbidden("Scheduling is private to staff and the teams' GMs");
  }
  const authority =
    round?.schedulingAuthority ?? championship.rules.scheduling.authority;

  return {
    championship,
    match,
    round,
    sideA: match.sideATeamId ? (teamById.get(match.sideATeamId) ?? null) : null,
    sideB: match.sideBTeamId ? (teamById.get(match.sideBTeamId) ?? null) : null,
    access: {
      actor,
      kind: isStaff ? "staff" : "gm",
      team: gmTeam,
      canPropose: isStaff
        ? authority === "staff" || authority === "staff-and-gms"
        : authority === "gms" || authority === "staff-and-gms",
      canIntervene: isStaff
    }
  };
}

async function projectScheduling(
  database: DatabaseExecutor,
  context: SchedulingContext,
  limit: number
): Promise<ChampionshipMatchSchedulingResponse> {
  const proposalRows = await database
    .select()
    .from(championshipScheduleProposals)
    .where(
      eq(championshipScheduleProposals.championshipMatchId, context.match.id)
    )
    .orderBy(asc(championshipScheduleProposals.id))
    .limit(limit + 1);
  const authorizationRows = await database
    .select()
    .from(championshipLatePlayAuthorizations)
    .where(
      eq(
        championshipLatePlayAuthorizations.championshipMatchId,
        context.match.id
      )
    )
    .orderBy(asc(championshipLatePlayAuthorizations.id))
    .limit(limit + 1);
  const accountIds = new Set<number>();
  for (const proposal of proposalRows) {
    accountIds.add(proposal.proposingAccountId);
    if (proposal.decidedByAccountId) {
      accountIds.add(proposal.decidedByAccountId);
    }
  }
  for (const authorization of authorizationRows) {
    accountIds.add(authorization.authorizedByAccountId);
  }
  const accountRows =
    accountIds.size === 0
      ? []
      : await database
          .select()
          .from(accounts)
          .where(inArray(accounts.id, [...accountIds]));
  const accountById = new Map(
    accountRows.map((account) => [account.id, account])
  );
  const proposalById = new Map(proposalRows.map((row) => [row.id, row]));
  const teamById = new Map(
    [context.sideA, context.sideB]
      .filter((team): team is NonNullable<typeof team> => team !== null)
      .map((team) => [team.id, team])
  );
  const now = Date.now();

  return {
    championshipRevision: context.championship.revision,
    actor: {
      access: context.access.kind,
      team: teamResponse(context.access.team),
      canPropose: context.access.canPropose,
      canIntervene: context.access.canIntervene
    },
    match: {
      uuid: context.match.uuid,
      label: context.match.label,
      sideA: teamResponse(context.sideA),
      sideB: teamResponse(context.sideB),
      scheduledAt: context.match.scheduledAt,
      scheduleStatus: context.match.scheduleStatus,
      scheduleRevision: context.match.scheduleRevision,
      revision: context.match.revision
    },
    competitionRound: context.round
      ? {
          uuid: context.round.uuid,
          name: context.round.name,
          startsAt: context.round.startsAt,
          endsAt: context.round.endsAt,
          schedulingAuthority:
            context.round.schedulingAuthority ??
            context.championship.rules.scheduling.authority,
          latePlayPolicy:
            context.round.latePlayPolicy ??
            context.championship.rules.scheduling.latePlayPolicy
        }
      : null,
    proposalMode: context.championship.rules.scheduling.proposalMode,
    proposals: {
      items: proposalRows.slice(0, limit).map((proposal) => ({
        uuid: proposal.uuid,
        parentProposalUuid: proposal.parentProposalId
          ? (proposalById.get(proposal.parentProposalId)?.uuid ?? null)
          : null,
        proposingTeam: teamResponse(
          proposal.proposingTeamId
            ? (teamById.get(proposal.proposingTeamId) ?? null)
            : null
        ),
        proposer: accountResponse(
          accountById.get(proposal.proposingAccountId)!
        ),
        mode: proposal.mode,
        exactTime: proposal.exactTime,
        availableFrom: proposal.availableFrom,
        availableTo: proposal.availableTo,
        state: proposal.state,
        note: proposal.note,
        decidedBy: proposal.decidedByAccountId
          ? accountResponse(accountById.get(proposal.decidedByAccountId)!)
          : null,
        decidedAt: proposal.decidedAt,
        revision: proposal.revision,
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt
      })),
      total: await rowCount(
        database,
        championshipScheduleProposals,
        championshipScheduleProposals.championshipMatchId,
        context.match.id
      ),
      truncated: proposalRows.length > limit
    },
    lateAuthorizations: {
      items: authorizationRows.slice(0, limit).map((authorization) => ({
        uuid: authorization.uuid,
        authorizedBy: accountResponse(
          accountById.get(authorization.authorizedByAccountId)!
        ),
        reason: authorization.reason,
        expiresAt: authorization.expiresAt,
        revokedAt: authorization.revokedAt,
        active:
          authorization.revokedAt === null &&
          (authorization.expiresAt === null ||
            new Date(authorization.expiresAt).getTime() > now),
        revision: authorization.revision,
        createdAt: authorization.createdAt
      })),
      total: await rowCount(
        database,
        championshipLatePlayAuthorizations,
        championshipLatePlayAuthorizations.championshipMatchId,
        context.match.id
      ),
      truncated: authorizationRows.length > limit
    }
  };
}

function validateProposalShape(input: CreateChampionshipScheduleProposalInput) {
  if (input.mode === "exact-time") {
    if (!input.exactTime || input.availableFrom || input.availableTo) {
      throw badRequest(
        "Exact-time proposals require exactTime and cannot contain a range"
      );
    }
    return;
  }
  if (
    !input.availableFrom ||
    !input.availableTo ||
    input.exactTime ||
    new Date(input.availableFrom).getTime() >=
      new Date(input.availableTo).getTime()
  ) {
    throw badRequest(
      "Availability proposals require an increasing availableFrom/availableTo range"
    );
  }
}

function validateProposalMode(
  championship: Championship,
  mode: "exact-time" | "availability-range"
) {
  const configured = championship.rules.scheduling.proposalMode;
  if (configured !== "both" && configured !== mode) {
    throw forbidden(`Schedule proposal mode ${mode} is disabled`);
  }
}

function authorizeProposalDecision(
  context: SchedulingContext,
  proposal: typeof championshipScheduleProposals.$inferSelect,
  actorAccountId: number,
  decision: "accept" | "reject" | "withdraw"
) {
  if (context.access.kind === "staff") {
    return;
  }
  if (decision === "withdraw") {
    if (proposal.proposingAccountId !== actorAccountId) {
      throw forbidden("Only the proposer can withdraw this proposal");
    }
    return;
  }
  if (
    proposal.proposingTeamId === null ||
    proposal.proposingTeamId === context.access.team?.id
  ) {
    throw forbidden("Only the opposing team can decide this proposal");
  }
}

function acceptedScheduleTime(
  proposal: typeof championshipScheduleProposals.$inferSelect,
  selected: string | null | undefined
) {
  if (proposal.mode === "exact-time") {
    if (selected && selected !== proposal.exactTime) {
      throw badRequest(
        "Accepting an exact-time proposal cannot change its scheduled time"
      );
    }
    return proposal.exactTime!;
  }
  if (!selected) {
    throw badRequest(
      "Accepting an availability range requires an exact scheduledAt"
    );
  }
  const selectedMs = new Date(selected).getTime();
  if (
    selectedMs < new Date(proposal.availableFrom!).getTime() ||
    selectedMs > new Date(proposal.availableTo!).getTime()
  ) {
    throw badRequest("The selected time is outside the proposed availability");
  }
  return selected;
}

export async function validateChampionshipScheduledTime(
  database: DatabaseExecutor,
  context: Pick<SchedulingContext, "championship" | "match" | "round">,
  scheduledAt: string
) {
  const scheduledMs = new Date(scheduledAt).getTime();
  if (
    context.round?.startsAt &&
    scheduledMs < new Date(context.round.startsAt).getTime()
  ) {
    throw badRequest("The scheduled time is before the competition round");
  }
  if (
    !context.round?.endsAt ||
    scheduledMs <= new Date(context.round.endsAt).getTime()
  ) {
    return;
  }
  const policy =
    context.round.latePlayPolicy ??
    context.championship.rules.scheduling.latePlayPolicy;
  if (policy === "forbidden") {
    throw forbidden("Late play is forbidden for this competition round");
  }
  if (policy === "allowed") {
    return;
  }
  const authorizations = await database
    .select()
    .from(championshipLatePlayAuthorizations)
    .where(
      and(
        eq(
          championshipLatePlayAuthorizations.championshipMatchId,
          context.match.id
        ),
        isNull(championshipLatePlayAuthorizations.revokedAt)
      )
    );
  const scheduled = scheduledMs;
  const authorized = authorizations.some(
    (authorization) =>
      authorization.expiresAt === null ||
      new Date(authorization.expiresAt).getTime() >= scheduled
  );
  if (!authorized) {
    throw forbidden("Late play requires an active staff authorization");
  }
}

export function championshipScheduleStatusFor(
  context: Pick<SchedulingContext, "round">,
  scheduledAt: string
): "scheduled" | "late-authorized" {
  return context.round?.endsAt &&
    new Date(scheduledAt).getTime() > new Date(context.round.endsAt).getTime()
    ? "late-authorized"
    : "scheduled";
}

function validateFutureExpiry(expiresAt: string | null | undefined) {
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw badRequest("Late-play authorization expiry must be in the future");
  }
}

async function requireProposal(
  database: DatabaseExecutor,
  matchId: number,
  proposalUuid: string
) {
  const [proposal] = await database
    .select()
    .from(championshipScheduleProposals)
    .where(
      and(
        eq(championshipScheduleProposals.uuid, proposalUuid),
        eq(championshipScheduleProposals.championshipMatchId, matchId)
      )
    );
  if (!proposal) {
    throw notFound("Schedule proposal not found");
  }
  return proposal;
}

function requireScheduleRevision(
  match: typeof championshipMatches.$inferSelect,
  expected: number
) {
  if (match.scheduleRevision !== expected) {
    throw conflict("Match schedule revision does not match", {
      matchUuid: match.uuid,
      expectedRevision: expected,
      currentRevision: match.scheduleRevision
    });
  }
}

function requireProposalRevision(
  proposal: typeof championshipScheduleProposals.$inferSelect,
  expected: number
) {
  if (proposal.revision !== expected) {
    throw conflict("Schedule proposal revision does not match", {
      proposalUuid: proposal.uuid,
      expectedRevision: expected,
      currentRevision: proposal.revision
    });
  }
}

async function notifyOpponentGms(
  database: DbTransaction,
  context: SchedulingContext,
  actorAccountId: number,
  notification: { title: string; body: string | null; dedupeKey: string }
) {
  const actorTeamId = context.access.team?.id ?? null;
  const targetTeamIds =
    actorTeamId === null
      ? [context.sideA?.id, context.sideB?.id]
      : [
          context.sideA?.id === actorTeamId
            ? context.sideB?.id
            : context.sideA?.id
        ];
  return notifyTeamGms(
    database,
    context,
    targetTeamIds.filter((id): id is number => id !== undefined),
    actorAccountId,
    notification
  );
}

async function notifyMatchGms(
  database: DbTransaction,
  context: SchedulingContext,
  actorAccountId: number,
  notification: { title: string; body: string | null; dedupeKey: string }
) {
  return notifyTeamGms(
    database,
    context,
    [context.sideA?.id, context.sideB?.id].filter(
      (id): id is number => id !== undefined
    ),
    actorAccountId,
    notification
  );
}

async function notifyTeamGms(
  database: DbTransaction,
  context: SchedulingContext,
  teamIds: number[],
  actorAccountId: number,
  notification: { title: string; body: string | null; dedupeKey: string }
) {
  if (teamIds.length === 0) {
    return 0;
  }
  const recipients = await database
    .select({ accountId: championshipParticipants.accountId })
    .from(championshipTeamMemberships)
    .innerJoin(
      championshipParticipants,
      eq(championshipTeamMemberships.participantId, championshipParticipants.id)
    )
    .where(
      and(
        inArray(championshipTeamMemberships.teamId, teamIds),
        eq(championshipTeamMemberships.role, "gm"),
        isNull(championshipTeamMemberships.endedAt),
        eq(championshipParticipants.status, "active")
      )
    );
  const accountIds = [
    ...new Set(
      recipients
        .map((row) => row.accountId)
        .filter(
          (accountId): accountId is number =>
            accountId !== null && accountId !== actorAccountId
        )
    )
  ];
  if (accountIds.length === 0) {
    return 0;
  }
  await database.insert(championshipInboxItems).values(
    accountIds.map((accountId) => ({
      accountId,
      championshipId: context.championship.id,
      kind: "schedule" as const,
      title: notification.title,
      body: notification.body,
      contextType: "championship-match",
      contextUuid: context.match.uuid,
      dedupeKey: `${notification.dedupeKey}:${accountId}`
    }))
  );
  return accountIds.length;
}

function teamResponse(team: typeof championshipTeams.$inferSelect | null) {
  return team
    ? { uuid: team.uuid, name: team.name, abbreviation: team.abbreviation }
    : null;
}

function accountResponse(account: typeof accounts.$inferSelect) {
  return { accountUuid: account.uuid, name: account.name };
}

async function rowCount(
  database: DatabaseExecutor,
  table:
    | typeof championshipScheduleProposals
    | typeof championshipLatePlayAuthorizations,
  column:
    | typeof championshipScheduleProposals.championshipMatchId
    | typeof championshipLatePlayAuthorizations.championshipMatchId,
  matchId: number
) {
  const [row] = await database
    .select({ total: count() })
    .from(table)
    .where(eq(column, matchId));
  return row?.total ?? 0;
}
