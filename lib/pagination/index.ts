import { type Static, t } from "elysia";
import type { TSchema } from "@sinclair/typebox";
import { asc, desc, gt, lt, type AnyColumn } from "drizzle-orm";

type CursorDirection = "asc" | "desc";

const defaultPageLimit = 50;
const maxPageLimit = 100;

export const paginationQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: maxPageLimit })),
  cursor: t.Optional(t.String({ minLength: 1 }))
});

export type PaginationQuery = Static<typeof paginationQuerySchema>;

export type PageInfo = {
  limit: number;
  nextCursor: string | null;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: PageInfo;
};

export function paginatedResponseSchema<TItemSchema extends TSchema>(
  itemSchema: TItemSchema
) {
  return t.Object({
    items: t.Array(itemSchema),
    page: t.Object({
      limit: t.Integer({ minimum: 1, maximum: maxPageLimit }),
      nextCursor: t.Nullable(t.String())
    })
  });
}

export function resolvePaginationQuery(query: PaginationQuery = {}) {
  return {
    limit: query.limit ?? defaultPageLimit,
    cursor: query.cursor
  };
}

export function pageLimit(query: PaginationQuery = {}): number {
  return resolvePaginationQuery(query).limit + 1;
}

export function cursorAfter(
  column: AnyColumn,
  cursor: string | undefined,
  direction: CursorDirection
) {
  const value = decodeCursor<unknown>(cursor);

  if (value === undefined) {
    return undefined;
  }

  return direction === "asc" ? gt(column, value) : lt(column, value);
}

export function cursorSort(column: AnyColumn, direction: CursorDirection) {
  return direction === "asc" ? asc(column) : desc(column);
}

export function pageItems<T, TCursor>(
  rows: T[],
  query: PaginationQuery,
  cursorFor: (row: T) => TCursor
): PaginatedResponse<T> {
  const { limit } = resolvePaginationQuery(query);
  const items = rows.slice(0, limit);
  const nextRow = rows[limit];

  return {
    items,
    page: {
      limit,
      nextCursor: nextRow
        ? encodeCursor(cursorFor(items.at(-1) ?? nextRow))
        : null
    }
  };
}

export function encodeCursor(value: unknown): string {
  const json = JSON.stringify({ value });

  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor<T>(cursor: string | undefined): T | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );

    return decoded.value as T;
  } catch {
    return undefined;
  }
}
