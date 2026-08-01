import { describe, expect, it } from "bun:test";
import {
  executePipeline,
  validateVisualizationSpecification
} from "@/features/visualizations/pipeline";

const rows = [
  { player: "A", team: "red", yards: 10, attempts: 2 },
  { player: "B", team: "red", yards: 20, attempts: 4 },
  { player: "C", team: "blue", yards: 15, attempts: 3 }
];

describe("visualization pipeline", () => {
  it("filters, calculates, sorts, ranks and limits deterministically", () => {
    expect(
      executePipeline(rows, [
        {
          type: "filter",
          expression: { op: "gte", args: [{ field: "yards" }, 15] }
        },
        {
          type: "formula",
          as: "average",
          expression: {
            op: "divide",
            args: [{ field: "yards" }, { field: "attempts" }]
          }
        },
        { type: "sort", field: "average", direction: "desc" },
        { type: "rank" },
        { type: "limit", count: 1 }
      ])
    ).toEqual([
      { player: "B", team: "red", yards: 20, attempts: 4, average: 5, rank: 1 }
    ]);
  });

  it.each([
    ["sum", 30],
    ["count", 2],
    ["average", 15],
    ["min", 10],
    ["max", 20],
    ["median", 15],
    ["variance", 25],
    ["standardDeviation", 5]
  ])("aggregates %s", (op, expected) => {
    const result = executePipeline(
      rows.filter((row) => row.team === "red"),
      [
        {
          type: "aggregate",
          groupBy: ["team"],
          metrics: [{ op, field: "yards", as: "value" }]
        }
      ]
    );
    expect(result[0]?.value).toBe(expected);
  });

  it("normalizes and accumulates values", () => {
    expect(
      executePipeline(rows.slice(0, 2), [
        { type: "normalize", field: "yards", as: "share" },
        { type: "cumulative", field: "yards", as: "running" }
      ])
    ).toEqual([
      { ...rows[0], share: 1 / 3, running: 10 },
      { ...rows[1], share: 2 / 3, running: 30 }
    ]);
  });

  it("folds and pivots datasets", () => {
    const folded = executePipeline(
      [rows[0]],
      [{ type: "fold", fields: ["yards", "attempts"] }]
    );
    expect(folded).toHaveLength(2);
    expect(
      executePipeline(folded, [
        { type: "pivot", index: "player", column: "key", value: "value" }
      ])
    ).toEqual([{ player: "A", yards: 10, attempts: 2 }]);
  });

  it("shapes hierarchy leaves and weighted edges", () => {
    const rows = [
      { team: "A", player: "Ana", opponent: "B", value: 2 },
      { team: "A", player: "Ana", opponent: "B", value: 3 },
      { team: "B", player: "Bia", opponent: "B", value: 9 }
    ];
    expect(
      executePipeline(rows, [
        { type: "hierarchy", path: ["team", "player"], value: "value" }
      ])
    ).toEqual([
      { team: "A", player: "Ana", value: 5 },
      { team: "B", player: "Bia", value: 9 }
    ]);
    expect(
      executePipeline(rows, [
        {
          type: "edges",
          source: "team",
          target: "opponent",
          value: "value"
        }
      ])
    ).toEqual([{ team: "A", opponent: "B", value: 5 }]);
  });

  it.each([
    { option: { formatter: "javascript:alert(1)" } },
    { option: { renderItem: "anything" } },
    { option: { symbol: "https://example.com/image.png" } },
    { option: { formatter: "(value) => value" } }
  ])("rejects unsafe renderer values", (unsafe) => {
    expect(() =>
      validateVisualizationSpecification({
        datasets: [{ id: "main", source: "players" }],
        ...unsafe
      })
    ).toThrow();
  });

  it("accepts a bounded declarative ECharts specification", () => {
    expect(
      validateVisualizationSpecification({
        datasets: [
          {
            id: "main",
            source: "players",
            operations: [{ type: "sort", field: "value" }]
          }
        ],
        option: {
          xAxis: { type: "category" },
          yAxis: { type: "value" },
          series: [{ type: "bar", datasetId: "main" }]
        }
      })
    ).toBeTruthy();
  });
});
