import type { GameModeReference } from "@/features/game-modes/_shared/http/inputs";
import {
  getGameModeByName,
  getGameModeByUuid
} from "@/features/game-modes/_shared/db/queries";

export { getGameModeByName, getGameModeByUuid };

export async function resolveGameModeId(
  reference: GameModeReference | null | undefined
): Promise<number | null | undefined> {
  if (reference === undefined) {
    return undefined;
  }

  if (reference === null) {
    return null;
  }

  const gameMode =
    "id" in reference
      ? await getGameModeByUuid(reference.id)
      : await getGameModeByName(reference.name);

  return gameMode.id;
}
