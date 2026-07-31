import { and, eq, notExists, sql } from "drizzle-orm";
import type { DbTransaction } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import {
  championshipPermissionGrants,
  championshipRoomPrograms
} from "@/features/championships/core/db";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import { championshipMatches } from "@/features/championships/format-scheduling/db";
import { championshipMatchResultRevisions } from "@/features/championships/matches-statistics/db";
import {
  type UpdateChampionshipGrantInput,
  type UpdateChampionshipRoomProgramInput
} from "@/features/championships/_shared/http/inputs";
import { type ChampionshipDetailResponse } from "@/features/championships/_shared/http/responses";
import { getChampionshipDetailFrom } from "@/features/championships/_shared/db/queries";
import { roomPrograms } from "@/features/rooms/core-db";
import { badRequest, notFound } from "@/shared/http/errors";

export async function updateChampionshipRoomProgram(
  championshipUuid: string,
  input: UpdateChampionshipRoomProgramInput
): Promise<ChampionshipDetailResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: `room-program.${input.operation}`
    },
    async (tx, championship) => {
      const [program] = await tx
        .select()
        .from(roomPrograms)
        .where(eq(roomPrograms.uuid, input.roomProgramId));

      if (!program) {
        throw notFound("Room program not found");
      }

      const [allowed] = await tx
        .select()
        .from(championshipRoomPrograms)
        .where(
          and(
            eq(championshipRoomPrograms.championshipId, championship.id),
            eq(championshipRoomPrograms.roomProgramId, program.id)
          )
        );
      const before = allowed ?? null;

      switch (input.operation) {
        case "add":
          if (allowed) {
            throw badRequest("Room program is already in the championship");
          }

          await tx.insert(championshipRoomPrograms).values({
            championshipId: championship.id,
            roomProgramId: program.id
          });
          break;
        case "reactivate":
          if (!allowed || allowed.state !== "retired") {
            throw badRequest("Retired championship room program not found");
          }

          await tx
            .update(championshipRoomPrograms)
            .set({ state: "active", updatedAt: new Date().toISOString() })
            .where(eq(championshipRoomPrograms.id, allowed.id));
          break;
        case "set-default":
          if (!allowed || allowed.state !== "active") {
            throw badRequest("Active championship room program not found");
          }

          await tx
            .update(championshipRoomPrograms)
            .set({ isDefault: false, updatedAt: new Date().toISOString() })
            .where(
              eq(championshipRoomPrograms.championshipId, championship.id)
            );
          await tx
            .update(championshipRoomPrograms)
            .set({ isDefault: true, updatedAt: new Date().toISOString() })
            .where(eq(championshipRoomPrograms.id, allowed.id));
          break;
        case "retire": {
          if (!allowed || allowed.state !== "active") {
            throw badRequest("Active championship room program not found");
          }

          const affectedMatches = await tx
            .select({ id: championshipMatches.id })
            .from(championshipMatches)
            .where(
              and(
                eq(championshipMatches.championshipId, championship.id),
                eq(championshipMatches.roomProgramId, program.id),
                notExists(
                  tx
                    .select({ id: championshipMatchResultRevisions.id })
                    .from(championshipMatchResultRevisions)
                    .where(
                      and(
                        eq(
                          championshipMatchResultRevisions.championshipMatchId,
                          championshipMatches.id
                        ),
                        eq(championshipMatchResultRevisions.state, "current")
                      )
                    )
                )
              )
            );
          const needsReplacement =
            allowed.isDefault || affectedMatches.length > 0;
          const replacement = input.replacementRoomProgramId
            ? await findActiveAllowedProgram(
                tx,
                championship.id,
                input.replacementRoomProgramId
              )
            : null;

          if (needsReplacement && !replacement) {
            throw badRequest(
              "A replacement room program is required for the default or unsettled matches"
            );
          }

          if (replacement?.roomProgramId === allowed.roomProgramId) {
            throw badRequest("Replacement room program must be different");
          }

          if (affectedMatches.length > 0 && replacement) {
            await tx
              .update(championshipMatches)
              .set({
                roomProgramId: replacement.roomProgramId,
                roomProgramVersionId: null,
                revision: sql`${championshipMatches.revision} + 1`,
                updatedAt: new Date().toISOString()
              })
              .where(
                and(
                  eq(championshipMatches.championshipId, championship.id),
                  eq(championshipMatches.roomProgramId, program.id),
                  notExists(
                    tx
                      .select({ id: championshipMatchResultRevisions.id })
                      .from(championshipMatchResultRevisions)
                      .where(
                        and(
                          eq(
                            championshipMatchResultRevisions.championshipMatchId,
                            championshipMatches.id
                          ),
                          eq(championshipMatchResultRevisions.state, "current")
                        )
                      )
                  )
                )
              );
          }

          if (allowed.isDefault && replacement) {
            await tx
              .update(championshipRoomPrograms)
              .set({ isDefault: true, updatedAt: new Date().toISOString() })
              .where(eq(championshipRoomPrograms.id, replacement.id));
          }

          await tx
            .update(championshipRoomPrograms)
            .set({
              state: "retired",
              isDefault: false,
              updatedAt: new Date().toISOString()
            })
            .where(eq(championshipRoomPrograms.id, allowed.id));
          break;
        }
      }

      const detail = await getChampionshipDetailFrom(tx, championship.uuid);

      return {
        response: () => detail,
        targetType: "room-program",
        targetUuid: program.uuid,
        before,
        after: detail.roomPrograms.find((item) => item.uuid === program.uuid),
        metadata: {
          operation: input.operation,
          replacementRoomProgramUuid: input.replacementRoomProgramId ?? null
        }
      };
    }
  );
}

export async function updateChampionshipGrant(
  championshipUuid: string,
  input: UpdateChampionshipGrantInput
): Promise<ChampionshipDetailResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: `permission.${input.operation}`
    },
    async (tx, championship, actor) => {
      const [target] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.uuid, input.accountUuid));

      if (!target) {
        throw notFound("Grant account not found");
      }

      const [existing] = await tx
        .select()
        .from(championshipPermissionGrants)
        .where(
          and(
            eq(championshipPermissionGrants.championshipId, championship.id),
            eq(championshipPermissionGrants.accountId, target.id),
            eq(championshipPermissionGrants.permission, input.permission)
          )
        );

      if (input.operation === "grant") {
        if (existing) {
          throw badRequest("Championship permission is already granted");
        }

        await tx.insert(championshipPermissionGrants).values({
          championshipId: championship.id,
          accountId: target.id,
          permission: input.permission,
          grantedByAccountId: actor.account.id
        });
      } else {
        if (!existing) {
          throw badRequest("Championship permission grant not found");
        }

        await tx
          .delete(championshipPermissionGrants)
          .where(eq(championshipPermissionGrants.id, existing.id));
      }

      const detail = await getChampionshipDetailFrom(tx, championship.uuid);

      return {
        response: () => detail,
        targetType: "permission-grant",
        targetUuid: target.uuid,
        before: existing ?? null,
        after:
          input.operation === "grant"
            ? detail.grants.find(
                (grant) =>
                  grant.accountUuid === target.uuid &&
                  grant.permission === input.permission
              )
            : null,
        metadata: {
          permission: input.permission,
          operation: input.operation
        }
      };
    }
  );
}

async function findActiveAllowedProgram(
  database: DbTransaction,
  championshipId: number,
  programUuid: string
) {
  const [row] = await database
    .select({
      id: championshipRoomPrograms.id,
      roomProgramId: championshipRoomPrograms.roomProgramId
    })
    .from(championshipRoomPrograms)
    .innerJoin(
      roomPrograms,
      eq(championshipRoomPrograms.roomProgramId, roomPrograms.id)
    )
    .where(
      and(
        eq(championshipRoomPrograms.championshipId, championshipId),
        eq(championshipRoomPrograms.state, "active"),
        eq(roomPrograms.uuid, programUuid)
      )
    );

  if (!row) {
    throw badRequest("Active replacement room program not found");
  }

  return row;
}
