import { decodeCursor, encodeCursor } from "@lib";
import type {
  BooleanFilter,
  FloatFilter,
  IntFilter,
  LivePlayerWhereInput,
  LiveRoomWhereInput,
  LiveStateDocumentWhereInput,
  LiveStateFactWhereInput,
  StringFilter
} from "@/features/live-state/_graphql/generated";
import type {
  LivePlayer,
  LiveRoomState,
  LiveStateDocument,
  LiveStateFact
} from "@/features/live-state/_shared/domain/protocol";

type ListRelationFilter<TWhere> = {
  some?: TWhere | null;
  every?: TWhere | null;
  none?: TWhere | null;
};

export function connection<T extends object & Record<string, unknown>>(
  allItems: T[],
  args: { first?: number | null; after?: string | null }
): {
  edges: Array<{ cursor: string; node: T }>;
  nodes: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
} {
  const first = Math.min(Math.max(args.first ?? 50, 1), 100);
  const after = decodeCursor<number>(args.after ?? undefined);
  const start = typeof after === "number" ? after + 1 : 0;
  const items = allItems.slice(start, start + first);
  const hasNextPage = start + first < allItems.length;
  const endIndex = items.length > 0 ? start + items.length - 1 : null;

  return {
    edges: items.map((node, index) => ({
      cursor: encodeCursor(start + index),
      node
    })),
    nodes: items,
    pageInfo: {
      hasNextPage,
      endCursor: endIndex === null ? null : encodeCursor(endIndex)
    }
  };
}

export function matchesLiveRoom(
  room: LiveRoomState,
  where?: LiveRoomWhereInput | null
): boolean {
  if (!where) return true;

  return matchesLogical(where, matchesLiveRoom.bind(null, room), () => {
    if (!matchesString(room.id, where.id)) return false;
    if (!matchesBoolean(room.connected, where.connected)) return false;
    if (!matchesRelation(room.players, where.players, matchesPlayer)) {
      return false;
    }
    if (
      !matchesRelation(
        room.stateDocuments,
        where.stateDocuments,
        matchesStateDocument
      )
    ) {
      return false;
    }
    if (!matchesRelation(room.stateFacts, where.stateFacts, matchesStateFact)) {
      return false;
    }

    return true;
  });
}

export function matchesPlayer(
  player: LivePlayer,
  where?: LivePlayerWhereInput | null
): boolean {
  if (!where) return true;

  return matchesLogical(where, matchesPlayer.bind(null, player), () => {
    return (
      matchesInt(player.roomPlayerId, where.roomPlayerId) &&
      matchesString(player.name, where.name) &&
      matchesString(player.team, where.team) &&
      matchesBoolean(player.admin, where.admin) &&
      matchesBoolean(player.desynced, where.desynced) &&
      matchesString(player.sessionKind, where.sessionKind) &&
      matchesBoolean(player.playable, where.playable)
    );
  });
}

export function matchesStateDocument(
  document: LiveStateDocument,
  where?: LiveStateDocumentWhereInput | null
): boolean {
  if (!where) return true;

  return matchesLogical(
    where,
    matchesStateDocument.bind(null, document),
    () => {
      return (
        matchesString(document.namespace, where.namespace) &&
        matchesString(document.name, where.name) &&
        matchesInt(document.version, where.version)
      );
    }
  );
}

export function matchesStateFact(
  fact: LiveStateFact,
  where?: LiveStateFactWhereInput | null
): boolean {
  if (!where) return true;

  return matchesLogical(where, matchesStateFact.bind(null, fact), () => {
    return (
      matchesString(fact.namespace, where.namespace) &&
      matchesString(fact.key, where.key) &&
      matchesString(fact.type, where.type) &&
      matchesString(fact.stringValue, where.stringValue) &&
      matchesFloat(fact.numberValue, where.numberValue) &&
      matchesBoolean(fact.booleanValue, where.booleanValue)
    );
  });
}

function matchesRelation<TItem, TWhere>(
  items: TItem[],
  filter: ListRelationFilter<TWhere> | null | undefined,
  predicate: (item: TItem, where?: TWhere | null) => boolean
) {
  if (!filter) return true;
  if (filter.some && !items.some((item) => predicate(item, filter.some))) {
    return false;
  }
  if (filter.every && !items.every((item) => predicate(item, filter.every))) {
    return false;
  }
  if (filter.none && items.some((item) => predicate(item, filter.none))) {
    return false;
  }

  return true;
}

function matchesLogical<
  TWhere extends {
    AND?: TWhere[] | null;
    OR?: TWhere[] | null;
    NOT?: TWhere[] | null;
  }
>(
  where: TWhere,
  predicate: (where?: TWhere | null) => boolean,
  ownPredicate: () => boolean
) {
  if (!ownPredicate()) return false;
  if (where.AND?.some((item) => !predicate(item))) return false;
  if (
    where.OR &&
    where.OR.length > 0 &&
    !where.OR.some((item) => predicate(item))
  ) {
    return false;
  }
  if (where.NOT?.some((item) => predicate(item))) return false;

  return true;
}

function matchesString(
  value: string | null | undefined,
  filter?: StringFilter | null
) {
  if (!filter) return true;
  if (filter.equals != null && value !== filter.equals) return false;
  if (filter.contains != null && !value?.includes(filter.contains)) {
    return false;
  }
  if (filter.startsWith != null && !value?.startsWith(filter.startsWith)) {
    return false;
  }

  return true;
}

function matchesBoolean(
  value: boolean | null | undefined,
  filter?: BooleanFilter | null
) {
  return !filter || filter.equals == null || value === filter.equals;
}

function matchesInt(value: number, filter?: IntFilter | null) {
  return !filter || filter.equals == null || value === filter.equals;
}

function matchesFloat(
  value: number | null | undefined,
  filter?: FloatFilter | null
) {
  return !filter || filter.equals == null || value === filter.equals;
}
