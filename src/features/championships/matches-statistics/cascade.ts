export type CascadeMatchNode = {
  id: number;
  uuid: string;
  label: string;
  displayOrder: number;
  sideASpotId: number;
  sideBSpotId: number;
  resultRevision: number;
  evidenceRevision: number;
};

export type CascadeRouteEdge = {
  sourceMatchId: number;
  destinationSpotId: number;
};

export type CascadeImpact = {
  match: CascadeMatchNode;
  depth: number;
};

export function calculateCorrectionCascade(
  sourceMatchId: number,
  changedDestinationSpotIds: number[],
  matches: CascadeMatchNode[],
  routes: CascadeRouteEdge[]
): CascadeImpact[] {
  const matchBySpotId = new Map<number, CascadeMatchNode[]>();
  const routesByMatchId = new Map<number, CascadeRouteEdge[]>();

  for (const match of matches) {
    for (const spotId of [match.sideASpotId, match.sideBSpotId]) {
      const spotMatches = matchBySpotId.get(spotId) ?? [];
      spotMatches.push(match);
      matchBySpotId.set(spotId, spotMatches);
    }
  }
  for (const route of routes) {
    const matchRoutes = routesByMatchId.get(route.sourceMatchId) ?? [];
    matchRoutes.push(route);
    routesByMatchId.set(route.sourceMatchId, matchRoutes);
  }

  const queue = changedDestinationSpotIds.map((spotId) => ({
    spotId,
    depth: 1
  }));
  const impactByMatchId = new Map<number, CascadeImpact>();
  const visitedSpots = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visitedSpots.has(current.spotId)) {
      continue;
    }
    visitedSpots.add(current.spotId);

    for (const match of matchBySpotId.get(current.spotId) ?? []) {
      if (match.id === sourceMatchId) {
        continue;
      }
      const existing = impactByMatchId.get(match.id);

      if (!existing || current.depth < existing.depth) {
        impactByMatchId.set(match.id, {
          match,
          depth: current.depth
        });
      }

      for (const route of routesByMatchId.get(match.id) ?? []) {
        queue.push({
          spotId: route.destinationSpotId,
          depth: current.depth + 1
        });
      }
    }
  }

  return [...impactByMatchId.values()].sort(
    (left, right) =>
      left.depth - right.depth ||
      left.match.displayOrder - right.match.displayOrder ||
      left.match.id - right.match.id
  );
}
