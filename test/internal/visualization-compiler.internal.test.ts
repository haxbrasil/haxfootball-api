import { describe, expect, it } from "bun:test";
import { compileVisualization } from "@/features/visualizations/compiler";
import type {
  VisualizationChartType,
  VisualizationSpec
} from "@/features/visualizations/db";

const rows = [
  {
    player: "Ana",
    team: "Red",
    opponent: "Blue",
    date: "2026-07-01",
    value: 12,
    assists: 4,
    tackles: 8
  },
  {
    player: "Bia",
    team: "Blue",
    opponent: "Gold",
    date: "2026-07-02",
    value: 8,
    assists: 7,
    tackles: 5
  },
  {
    player: "Caio",
    team: "Red",
    opponent: "Gold",
    date: "2026-07-03",
    value: 15,
    assists: 5,
    tackles: 11
  }
];

function compile(
  type: VisualizationChartType,
  fields: Record<string, string | readonly string[]>,
  settings = {}
) {
  const specification: VisualizationSpec = {
    datasets: [{ id: "main", source: "players" }],
    option: {},
    chart: {
      type,
      datasetId: "main",
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
          key,
          Array.isArray(value) ? [...value] : value
        ])
      ) as Record<string, string | string[]>,
      settings
    }
  };
  return compileVisualization(specification, [{ id: "main", rows }]);
}

describe("visualization compiler", () => {
  it("keeps every category label visible on dense vertical charts", () => {
    const option = compileVisualization(
      {
        datasets: [{ id: "principal", source: "players" }],
        option: {},
        chart: {
          type: "bar",
          datasetId: "principal",
          fields: { category: "player", metrics: ["value"] }
        }
      },
      [
        {
          id: "principal",
          rows: Array.from({ length: 10 }, (_, index) => ({
            player: `Jogador ${index + 1}`,
            value: index
          }))
        }
      ]
    );

    expect(option.xAxis).toMatchObject({
      type: "category",
      axisLabel: { interval: 0, hideOverlap: false, rotate: 28 }
    });
  });

  it.each([
    ["bar", { category: "player", metrics: ["value", "assists"] }],
    ["line", { category: "player", metrics: ["value"] }],
    ["area", { category: "player", metrics: ["value"] }],
    ["scatter", { x: "assists", y: "tackles" }],
    ["bubble", { x: "assists", y: "tackles", size: "value" }],
    ["pie", { category: "player", value: "value" }],
    ["donut", { category: "player", value: "value" }],
    ["radar", { entity: "player", metrics: ["value", "assists", "tackles"] }],
    ["heatmap", { x: "team", y: "opponent", value: "value" }],
    ["boxplot", { category: "team", value: "value" }],
    ["funnel", { category: "player", value: "value" }],
    ["gauge", { value: "value" }],
    ["treemap", { path: ["team", "player"], value: "value" }],
    ["sunburst", { path: ["team", "player"], value: "value" }],
    ["sankey", { source: "team", target: "opponent", value: "value" }],
    ["graph", { source: "team", target: "opponent", value: "value" }],
    ["tree", { path: ["team", "player"], value: "value" }],
    [
      "parallel",
      { entity: "player", metrics: ["value", "assists", "tackles"] }
    ],
    ["calendar", { date: "date", value: "value" }]
  ] as const)(
    "compiles %s into a renderable ECharts series",
    (type, fields) => {
      const option = compile(type, fields);
      expect(Array.isArray(option.series)).toBe(true);
      expect((option.series as unknown[]).length).toBeGreaterThan(0);
    }
  );

  it("preserves legacy ECharts options", () => {
    const option = { series: [{ type: "bar" }] };
    expect(
      compileVisualization(
        { datasets: [{ id: "main", source: "players" }], option },
        []
      )
    ).toBe(option);
  });

  it("rejects cyclic Sankey data while graph charts remain valid", () => {
    const cyclicRows = [
      { team: "A", opponent: "B", value: 1 },
      { team: "B", opponent: "A", value: 1 }
    ];
    const specification: VisualizationSpec = {
      datasets: [{ id: "main", source: "players" }],
      option: {},
      chart: {
        type: "sankey",
        datasetId: "main",
        fields: { source: "team", target: "opponent", value: "value" }
      }
    };
    expect(() =>
      compileVisualization(specification, [{ id: "main", rows: cyclicRows }])
    ).toThrow("directed cycle");
    expect(
      compileVisualization(
        { ...specification, chart: { ...specification.chart!, type: "graph" } },
        [{ id: "main", rows: cyclicRows }]
      ).series
    ).toBeArray();
  });
});
