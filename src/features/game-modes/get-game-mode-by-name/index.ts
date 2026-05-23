import { resolveLabels } from "@/features/localization/resolve-labels";
import type { GameModeLanguageQuery } from "@/features/game-modes/_shared/http/inputs";
import type { GameModeResponse } from "@/features/game-modes/_shared/http/responses";
import { toGameModeResponse } from "@/features/game-modes/_shared/http/responses";
import { getGameModeByName as getGameModeRowByName } from "@/features/game-modes/_shared/db/queries";

export async function getGameModeByName(
  name: string,
  query: GameModeLanguageQuery = {}
): Promise<GameModeResponse> {
  const gameMode = await getGameModeRowByName(name);
  const labels = await resolveLabels(
    [gameMode.title, gameMode.description].filter(
      (value): value is string => !!value
    ),
    query.language
  );

  return toGameModeResponse(gameMode, labels);
}
