import { type Static, t } from "elysia";
import type { GameMode } from "@/features/game-modes/db";
import {
  gameModeNameSchema,
  gameModeUuidSchema,
  gameModeVisibilitySchema
} from "@/features/game-modes/_shared/http/inputs";

export const gameModeResponseSchema = t.Object({
  id: gameModeUuidSchema,
  name: gameModeNameSchema,
  title: t.Nullable(
    t.Object({
      value: t.String(),
      label: t.String()
    })
  ),
  description: t.Nullable(
    t.Object({
      value: t.String(),
      label: t.String()
    })
  ),
  visibility: gameModeVisibilitySchema,
  rank: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export type GameModeResponse = Static<typeof gameModeResponseSchema>;

export function toGameModeResponse(
  gameMode: GameMode,
  labels: Map<string, string> = new Map()
): GameModeResponse {
  return {
    id: gameMode.uuid,
    name: gameMode.name,
    title: gameMode.title ? toLocalizedText(gameMode.title, labels) : null,
    description: gameMode.description
      ? toLocalizedText(gameMode.description, labels)
      : null,
    visibility: gameMode.visibility,
    rank: gameMode.rank,
    createdAt: gameMode.createdAt,
    updatedAt: gameMode.updatedAt
  };
}

function toLocalizedText(value: string, labels: Map<string, string>) {
  return {
    value,
    label: labels.get(value) ?? value
  };
}
