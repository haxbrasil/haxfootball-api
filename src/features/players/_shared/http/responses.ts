import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/db";
import type { Player } from "@/features/players/db";

export const playerAccountResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  externalId: t.String()
});

export const playerResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
  country: t.Nullable(t.String()),
  account: t.Nullable(playerAccountResponseSchema),
  createdAt: t.String(),
  updatedAt: t.String()
});

export type PlayerResponse = Static<typeof playerResponseSchema>;

export type PlayerWithAccount = {
  player: Player;
  account: Account | null;
};

export function toPlayerResponse({
  player,
  account
}: PlayerWithAccount): PlayerResponse {
  return {
    id: player.externalId,
    name: player.name,
    country: player.country,
    account: account
      ? {
          uuid: account.uuid,
          name: account.name,
          externalId: account.externalId
        }
      : null,
    createdAt: player.createdAt,
    updatedAt: player.updatedAt
  };
}
