import { resolveLabels } from "@/features/localization/resolve-labels";
import type { GameModeLanguageQuery } from "@/features/game-modes/_shared/http/inputs";
import type { GameModeResponse } from "@/features/game-modes/_shared/http/responses";
import { toGameModeResponse } from "@/features/game-modes/_shared/http/responses";
import { getGameModeByUuid } from "@/features/game-modes/_shared/db/queries";

export async function getGameMode(
  id: string,
  query: GameModeLanguageQuery = {}
): Promise<GameModeResponse> {
  const gameMode = await getGameModeByUuid(id);
  const labels = await resolveLabels(
    [gameMode.title, gameMode.description].filter(
      (value): value is string => !!value
    ),
    query.language
  );

  return toGameModeResponse(gameMode, labels);
}
