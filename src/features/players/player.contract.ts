import { type Static, t } from "elysia";
import type { Account } from "@/features/accounts/account.db";
import type { Player } from "@/features/players/player.db";

export const playerExternalIdSchema = t.String({
  minLength: 1,
  maxLength: 64
});

export const playerNameSchema = t.String({
  minLength: 1,
  maxLength: 25,
  pattern: ".*[A-Za-z0-9].*"
});

export const playerCountrySchema = t.String({
  minLength: 2,
  maxLength: 2,
  pattern: "^[a-z]{2}$"
});

export const playerAccountResponseSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  externalId: t.String()
});

export const playerResponseSchema = t.Object({
  id: t.Number(),
  externalId: t.String(),
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
    id: player.id,
    externalId: player.externalId,
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

export const playerIdParamsSchema = t.Object({
  id: t.Numeric({ minimum: 1 })
});
