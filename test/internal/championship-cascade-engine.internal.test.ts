import { describe, expect, it } from "bun:test";
import {
  calculateCorrectionCascade,
  type CascadeMatchNode,
  type CascadeRouteEdge
} from "@/features/championships/matches-statistics/cascade";

describe("championship correction cascade engine", () => {
  it("returns no impact when no destination changes", () => {
    expect(calculateCorrectionCascade(1, [], [], [])).toEqual([]);
  });

  it("orders branching impacts by depth then display order", () => {
    const matches = [
      match(2, 20, 21, 2),
      match(3, 30, 31, 1),
      match(4, 40, 41, 3)
    ];
    const routes = [route(2, 40), route(3, 41)];

    expect(
      calculateCorrectionCascade(1, [20, 30], matches, routes).map((impact) => [
        impact.match.id,
        impact.depth
      ])
    ).toEqual([
      [3, 1],
      [2, 1],
      [4, 2]
    ]);
  });

  it("terminates safely if malformed input contains a cycle", () => {
    const matches = [match(2, 20, 21, 1), match(3, 30, 31, 2)];
    const routes = [route(2, 30), route(3, 20)];

    expect(
      calculateCorrectionCascade(1, [20], matches, routes).map(
        (impact) => impact.match.id
      )
    ).toEqual([2, 3]);
  });

  for (let length = 1; length <= 128; length += 1) {
    it(`propagates a deterministic chain of ${length} downstream matches`, () => {
      const matches: CascadeMatchNode[] = [];
      const routes: CascadeRouteEdge[] = [];

      for (let index = 0; index < length; index += 1) {
        const id = index + 2;
        matches.push(match(id, id * 10, id * 10 + 1, index + 1));
        if (index < length - 1) {
          routes.push(route(id, (id + 1) * 10));
        }
      }

      const impact = calculateCorrectionCascade(1, [20], matches, routes);

      expect(impact).toHaveLength(length);
      expect(impact.map((item) => item.match.id)).toEqual(
        Array.from({ length }, (_, index) => index + 2)
      );
      expect(impact.map((item) => item.depth)).toEqual(
        Array.from({ length }, (_, index) => index + 1)
      );
      expect(new Set(impact.map((item) => item.match.id)).size).toBe(length);
    });
  }
});

function match(
  id: number,
  sideASpotId: number,
  sideBSpotId: number,
  displayOrder: number
): CascadeMatchNode {
  return {
    id,
    uuid: crypto.randomUUID(),
    label: `Match ${id}`,
    displayOrder,
    sideASpotId,
    sideBSpotId,
    resultRevision: id % 2,
    evidenceRevision: (id + 1) % 2
  };
}

function route(
  sourceMatchId: number,
  destinationSpotId: number
): CascadeRouteEdge {
  return { sourceMatchId, destinationSpotId };
}
