import { and, asc, eq, gt, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { resolveLabels } from "@/features/localization/resolve-labels";
import {
  type ListGameModesQuery,
  listGameModesQuerySchema
} from "@/features/game-modes/_shared/http/inputs";
import {
  gameModeResponseSchema,
  toGameModeResponse,
  type GameModeResponse
} from "@/features/game-modes/_shared/http/responses";
import { gameModes, type GameMode } from "@/features/game-modes/db";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  paginatedResponseSchema,
  type PaginatedResponse
} from "@lib";

export const listGameModesResponseSchema = paginatedResponseSchema(
  gameModeResponseSchema
);

export { listGameModesQuerySchema };

type GameModeCursor = {
  rank: number;
  id: number;
};

type GameModeListVisibility = NonNullable<ListGameModesQuery["visibility"]>;

export async function listGameModes(
  query: ListGameModesQuery = {}
): Promise<PaginatedResponse<GameModeResponse>> {
  const cursor = decodeCursor<GameModeCursor>(query.cursor);
  const visibility: GameModeListVisibility = query.visibility ?? "visible";
  const conditions = buildListConditions({ cursor, visibility });

  const rows = await db
    .select()
    .from(gameModes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(gameModes.rank), asc(gameModes.id))
    .limit(pageLimit(query));

  const page = pageItems(rows, query, toGameModeCursor);
  const labels = await resolveGameModeLabels(page.items, query.language);

  return {
    items: page.items.map((gameMode) => toGameModeResponse(gameMode, labels)),
    page: page.page
  };
}

function buildListConditions(input: {
  cursor: GameModeCursor | undefined;
  visibility: GameModeListVisibility;
}): SQL[] {
  const conditions: SQL[] = [];

  if (input.visibility !== "all") {
    conditions.push(eq(gameModes.visibility, input.visibility));
  }

  if (input.cursor) {
    conditions.push(gameModeCursorCondition(input.cursor));
  }

  return conditions;
}

function gameModeCursorCondition(cursor: GameModeCursor): SQL {
  return or(
    gt(gameModes.rank, cursor.rank),
    and(eq(gameModes.rank, cursor.rank), gt(gameModes.id, cursor.id))
  ) as SQL;
}

function toGameModeCursor(gameMode: GameMode): GameModeCursor {
  return {
    rank: gameMode.rank,
    id: gameMode.id
  };
}

function resolveGameModeLabels(
  gameModes: GameMode[],
  language: string | undefined
) {
  const valueKeys = gameModes.flatMap((gameMode) =>
    [gameMode.title, gameMode.description].filter(
      (value): value is string => !!value
    )
  );

  return resolveLabels(valueKeys, language);
}
