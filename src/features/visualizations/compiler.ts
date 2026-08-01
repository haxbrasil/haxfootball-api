import { badRequest } from "@/shared/http/errors";
import type {
  VisualizationChart,
  VisualizationChartType,
  VisualizationSpec
} from "@/features/visualizations/db";
import type { DataRow } from "@/features/visualizations/pipeline";

type Dataset = { id: string; rows: DataRow[] };
type EChartsOption = Record<string, unknown>;

const chartTypes = new Set<VisualizationChartType>([
  "bar",
  "line",
  "area",
  "scatter",
  "bubble",
  "pie",
  "donut",
  "radar",
  "heatmap",
  "boxplot",
  "funnel",
  "gauge",
  "treemap",
  "sunburst",
  "sankey",
  "graph",
  "tree",
  "parallel",
  "calendar"
]);

export function validateVisualizationChart(chart: unknown) {
  if (!isRecord(chart) || !chartTypes.has(chart.type as VisualizationChartType))
    throw badRequest("Unsupported visualization chart type");
  if (typeof chart.datasetId !== "string" || !chart.datasetId)
    throw badRequest("Visualization chart requires a dataset");
  if (!isRecord(chart.fields))
    throw badRequest("Visualization chart requires field mappings");
  const typed = chart as VisualizationChart;
  for (const role of requiredRoles(typed.type)) requireField(typed, role);
  if (typed.type === "radar" || typed.type === "parallel") {
    const metrics = fields(typed, "metrics");
    if (metrics.length < (typed.type === "radar" ? 3 : 2))
      throw badRequest(
        `${typed.type === "radar" ? "Radar" : "Parallel"} requires multiple metrics`
      );
  }
  return typed;
}

export function compileVisualization(
  specification: VisualizationSpec,
  datasets: Dataset[]
): EChartsOption {
  if (!specification.chart) return specification.option;
  const chart = validateVisualizationChart(specification.chart);
  const dataset = datasets.find((item) => item.id === chart.datasetId);
  if (!dataset)
    throw badRequest("Visualization chart dataset was not resolved");
  const base = { ...specification.option };
  delete base.series;
  delete base.xAxis;
  delete base.yAxis;
  delete base.radar;
  delete base.parallel;
  delete base.parallelAxis;
  delete base.calendar;
  delete base.visualMap;
  return { ...base, ...compileChart(chart, dataset.rows) };
}

function compileChart(
  chart: VisualizationChart,
  rows: DataRow[]
): EChartsOption {
  switch (chart.type) {
    case "bar":
    case "line":
    case "area":
      return cartesian(chart, rows);
    case "scatter":
    case "bubble":
      return scatter(chart, rows);
    case "pie":
    case "donut":
    case "funnel":
      return categoryValue(chart, rows);
    case "radar":
      return radar(chart, rows);
    case "heatmap":
      return heatmap(chart, rows);
    case "boxplot":
      return boxplot(chart, rows);
    case "gauge":
      return gauge(chart, rows);
    case "treemap":
    case "sunburst":
    case "tree":
      return hierarchy(chart, rows);
    case "sankey":
    case "graph":
      return network(chart, rows);
    case "parallel":
      return parallel(chart, rows);
    case "calendar":
      return calendar(chart, rows);
  }
}

function cartesian(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const category = field(chart, "category");
  const metrics = fields(chart, "metrics");
  const horizontal = setting(chart, "horizontal", false);
  const series = metrics.map((metric) => ({
    type: chart.type === "area" ? "line" : chart.type,
    name: displayField(chart, metric),
    datasetId: chart.datasetId,
    encode: horizontal
      ? { y: category, x: metric }
      : { x: category, y: metric },
    ...(chart.type === "area"
      ? { areaStyle: {}, smooth: setting(chart, "smooth", true) }
      : {}),
    ...(chart.type === "line"
      ? { smooth: setting(chart, "smooth", false) }
      : {}),
    ...(chart.type === "bar"
      ? {
          itemStyle: { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] }
        }
      : {})
  }));
  return {
    dataset: [{ id: chart.datasetId, source: rows }],
    grid: defaultGrid(),
    tooltip: { trigger: "axis" },
    legend: metrics.length > 1 ? {} : undefined,
    xAxis: { type: horizontal ? "value" : "category" },
    yAxis: { type: horizontal ? "category" : "value" },
    series
  };
}

function scatter(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const x = field(chart, "x");
  const y = field(chart, "y");
  const size = optionalField(chart, "size");
  const min = size ? minimum(rows, size) : 0;
  const max = size ? maximum(rows, size) : 1;
  return {
    dataset: [{ id: chart.datasetId, source: rows }],
    grid: defaultGrid(),
    tooltip: { trigger: "item" },
    xAxis: { type: "value", name: displayField(chart, x) },
    yAxis: { type: "value", name: displayField(chart, y) },
    ...(chart.type === "bubble" && size
      ? {
          visualMap: {
            show: true,
            dimension: size,
            min,
            max,
            inRange: { symbolSize: [10, 46] },
            calculable: true
          }
        }
      : {}),
    series: [
      {
        type: "scatter",
        datasetId: chart.datasetId,
        encode: {
          x,
          y,
          tooltip: fields(chart, "tooltip").length
            ? fields(chart, "tooltip")
            : [x, y, ...(size ? [size] : [])]
        }
      }
    ]
  };
}

function categoryValue(
  chart: VisualizationChart,
  rows: DataRow[]
): EChartsOption {
  const category = field(chart, "category");
  const value = field(chart, "value");
  if (chart.type === "funnel")
    return {
      tooltip: { trigger: "item" },
      legend: {},
      series: [
        {
          type: "funnel",
          sort: setting(chart, "sort", "descending"),
          gap: 3,
          label: { show: true, position: "inside" },
          data: aggregatePairs(rows, category, value)
        }
      ]
    };
  return {
    tooltip: { trigger: "item" },
    legend: { type: "scroll", bottom: 0 },
    series: [
      {
        type: "pie",
        radius: chart.type === "donut" ? ["45%", "72%"] : [0, "72%"],
        center: ["50%", "46%"],
        minAngle: 2,
        avoidLabelOverlap: true,
        data: aggregatePairs(rows, category, value)
      }
    ]
  };
}

function radar(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const entity = field(chart, "entity");
  const metrics = fields(chart, "metrics");
  const indicator = metrics.map((metric) => ({
    name: displayField(chart, metric),
    max: Math.max(1, maximum(rows, metric) * 1.1)
  }));
  return {
    tooltip: { trigger: "item" },
    legend: { type: "scroll", bottom: 0 },
    radar: { indicator, radius: "65%", splitNumber: 4 },
    series: [
      {
        type: "radar",
        data: rows.slice(0, 12).map((row) => ({
          name: text(row[entity]),
          value: metrics.map((metric) => number(row[metric]))
        }))
      }
    ]
  };
}

function heatmap(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const xField = field(chart, "x");
  const yField = field(chart, "y");
  const value = field(chart, "value");
  const x = distinct(rows.map((row) => text(row[xField])));
  const y = distinct(rows.map((row) => text(row[yField])));
  const cells = new Map<string, number>();
  for (const row of rows) {
    const key = `${text(row[xField])}\u0000${text(row[yField])}`;
    cells.set(key, (cells.get(key) ?? 0) + number(row[value]));
  }
  const data = [...cells.entries()].map(([key, cellValue]) => {
    const [xValue, yValue] = key.split("\u0000");
    return [x.indexOf(xValue), y.indexOf(yValue), cellValue];
  });
  const values = data.map((item) => item[2] as number);
  return {
    grid: defaultGrid(),
    tooltip: { position: "top" },
    xAxis: { type: "category", data: x, splitArea: { show: true } },
    yAxis: { type: "category", data: y, splitArea: { show: true } },
    visualMap: {
      min: Math.min(0, ...values),
      max: Math.max(1, ...values),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0
    },
    series: [
      { type: "heatmap", data, label: { show: setting(chart, "labels", true) } }
    ]
  };
}

function boxplot(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const category = field(chart, "category");
  const value = field(chart, "value");
  const groups = groupBy(rows, category);
  return {
    grid: defaultGrid(),
    tooltip: { trigger: "item" },
    xAxis: { type: "category", data: [...groups.keys()] },
    yAxis: { type: "value", scale: true },
    series: [
      {
        type: "boxplot",
        data: [...groups.values()].map((items) =>
          fiveNumbers(items.map((row) => number(row[value])))
        )
      }
    ]
  };
}

function gauge(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const value = field(chart, "value");
  const values = rows.map((row) => number(row[value]));
  const aggregate = setting<string>(chart, "aggregate", "average");
  const current =
    aggregate === "sum"
      ? values.reduce((sum, item) => sum + item, 0)
      : aggregate === "max"
        ? Math.max(0, ...values)
        : aggregate === "min"
          ? Math.min(0, ...values)
          : aggregate === "latest"
            ? (values.at(-1) ?? 0)
            : average(values);
  const configuredMax = Number(chart.settings?.max);
  const max =
    Number.isFinite(configuredMax) && configuredMax > 0
      ? configuredMax
      : Math.max(1, current * 1.25);
  return {
    tooltip: { trigger: "item" },
    series: [
      {
        type: "gauge",
        min: Number(chart.settings?.min) || 0,
        max,
        progress: { show: true, width: 14 },
        axisLine: { lineStyle: { width: 14 } },
        detail: { valueAnimation: true, formatter: "{value}" },
        data: [
          {
            value: round(current),
            name: String(chart.settings?.label ?? displayField(chart, value))
          }
        ]
      }
    ]
  };
}

function hierarchy(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const path = fields(chart, "path");
  const value = field(chart, "value");
  const data = buildHierarchy(rows, path, value);
  const series: Record<string, unknown> = {
    type: chart.type,
    data,
    label: { show: true },
    ...(chart.type === "tree"
      ? {
          orient: setting(chart, "orientation", "LR"),
          roam: true,
          expandAndCollapse: true,
          initialTreeDepth: Number(chart.settings?.depth ?? 3)
        }
      : {}),
    ...(chart.type === "sunburst"
      ? { radius: ["12%", "88%"], sort: undefined }
      : {}),
    ...(chart.type === "treemap"
      ? { roam: true, breadcrumb: { show: true } }
      : {})
  };
  return { tooltip: { trigger: "item" }, series: [series] };
}

function network(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const source = field(chart, "source");
  const target = field(chart, "target");
  const value = field(chart, "value");
  const links = aggregateLinks(rows, source, target, value);
  const names = distinct(links.flatMap((link) => [link.source, link.target]));
  if (chart.type === "sankey") {
    if (hasDirectedCycle(links))
      throw badRequest(
        "Sankey data contains a directed cycle; use a graph chart or filter the cycle"
      );
    return {
      tooltip: { trigger: "item" },
      series: [
        {
          type: "sankey",
          data: names.map((name) => ({ name })),
          links,
          emphasis: { focus: "adjacency" },
          nodeAlign: "justify",
          draggable: true
        }
      ]
    };
  }
  return {
    tooltip: { trigger: "item" },
    legend: {},
    series: [
      {
        type: "graph",
        layout: setting(chart, "layout", "force"),
        roam: true,
        draggable: true,
        data: names.map((name) => ({
          name,
          symbolSize:
            18 +
            links.filter((link) => link.source === name || link.target === name)
              .length *
              4
        })),
        links,
        force: { repulsion: 220, edgeLength: [60, 150] },
        emphasis: { focus: "adjacency" },
        label: { show: true }
      }
    ]
  };
}

function parallel(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const entity = optionalField(chart, "entity");
  const metrics = fields(chart, "metrics");
  return {
    parallel: {
      left: 60,
      right: 50,
      bottom: 50,
      top: 40,
      parallelAxisDefault: { type: "value", nameLocation: "end" }
    },
    parallelAxis: metrics.map((metric, index) => ({
      dim: index,
      name: displayField(chart, metric)
    })),
    tooltip: { trigger: "item" },
    series: [
      {
        type: "parallel",
        lineStyle: { width: 2, opacity: 0.6 },
        data: rows.map((row) => ({
          name: entity ? text(row[entity]) : undefined,
          value: metrics.map((metric) => number(row[metric]))
        }))
      }
    ]
  };
}

function calendar(chart: VisualizationChart, rows: DataRow[]): EChartsOption {
  const date = field(chart, "date");
  const value = field(chart, "value");
  const pairs = rows
    .map((row) => [dateText(row[date]), number(row[value])])
    .filter((item) => item[0]);
  const year = String(pairs[0]?.[0] ?? new Date().toISOString()).slice(0, 4);
  const values = pairs.map((item) => item[1] as number);
  return {
    tooltip: { position: "top" },
    visualMap: {
      min: Math.min(0, ...values),
      max: Math.max(1, ...values),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0
    },
    calendar: {
      range: year,
      cellSize: ["auto", 18],
      top: 50,
      left: 55,
      right: 25,
      yearLabel: { show: false }
    },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data: pairs }]
  };
}

function requiredRoles(type: VisualizationChartType) {
  const roles: Record<VisualizationChartType, string[]> = {
    bar: ["category", "metrics"],
    line: ["category", "metrics"],
    area: ["category", "metrics"],
    scatter: ["x", "y"],
    bubble: ["x", "y", "size"],
    pie: ["category", "value"],
    donut: ["category", "value"],
    radar: ["entity", "metrics"],
    heatmap: ["x", "y", "value"],
    boxplot: ["category", "value"],
    funnel: ["category", "value"],
    gauge: ["value"],
    treemap: ["path", "value"],
    sunburst: ["path", "value"],
    tree: ["path", "value"],
    sankey: ["source", "target", "value"],
    graph: ["source", "target", "value"],
    parallel: ["metrics"],
    calendar: ["date", "value"]
  };
  return roles[type];
}

function requireField(chart: VisualizationChart, role: string) {
  if (!fields(chart, role).length)
    throw badRequest(`${chart.type} requires the ${role} field`);
}
function field(chart: VisualizationChart, role: string) {
  const value = chart.fields[role];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}
function optionalField(chart: VisualizationChart, role: string) {
  return fields(chart, role)[0] || null;
}
function fields(chart: VisualizationChart, role: string) {
  const value = chart.fields[role];
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map(String)
    .filter(Boolean);
}
function setting<T>(chart: VisualizationChart, key: string, fallback: T): T {
  return (chart.settings?.[key] as T | undefined) ?? fallback;
}
function displayField(chart: VisualizationChart, key: string) {
  const labels = chart.settings?.fieldLabels;
  return isRecord(labels) && typeof labels[key] === "string"
    ? labels[key]
    : key;
}
function defaultGrid() {
  return { left: 32, right: 28, top: 42, bottom: 42, containLabel: true };
}
function text(value: unknown) {
  return String(value ?? "Não informado");
}
function number(value: unknown) {
  const output = Number(value);
  return Number.isFinite(output) ? output : 0;
}
function round(value: number) {
  return Math.round(value * 100) / 100;
}
function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}
function minimum(rows: DataRow[], fieldName: string) {
  return Math.min(0, ...rows.map((row) => number(row[fieldName])));
}
function maximum(rows: DataRow[], fieldName: string) {
  return Math.max(0, ...rows.map((row) => number(row[fieldName])));
}
function distinct<T>(values: T[]) {
  return [...new Set(values)];
}
function groupBy(rows: DataRow[], fieldName: string) {
  const groups = new Map<string, DataRow[]>();
  for (const row of rows) {
    const key = text(row[fieldName]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}
function aggregatePairs(rows: DataRow[], category: string, value: string) {
  return [...groupBy(rows, category)].map(([name, items]) => ({
    name,
    value: round(items.reduce((sum, row) => sum + number(row[value]), 0))
  }));
}
function fiveNumbers(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [0, 0, 0, 0, 0];
  return [
    sorted[0],
    quantile(sorted, 0.25),
    quantile(sorted, 0.5),
    quantile(sorted, 0.75),
    sorted.at(-1) ?? 0
  ].map(round);
}
function quantile(sorted: number[], position: number) {
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return (
    sorted[lower] +
    ((sorted[lower + 1] ?? sorted[lower]) - sorted[lower]) * fraction
  );
}
function buildHierarchy(rows: DataRow[], path: string[], value: string) {
  const roots: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    let level = roots;
    for (const pathField of path) {
      const name = text(row[pathField]);
      let node = level.find((item) => item.name === name);
      if (!node) {
        node = { name, value: 0, children: [] };
        level.push(node);
      }
      node.value = number(node.value) + number(row[value]);
      level = node.children as Array<Record<string, unknown>>;
    }
  }
  const prune = (
    nodes: Array<Record<string, unknown>>
  ): Array<Record<string, unknown>> =>
    nodes.map((node) => {
      const children = prune(node.children as Array<Record<string, unknown>>);
      return children.length
        ? { ...node, children }
        : { name: node.name, value: node.value };
    });
  return prune(roots);
}
function aggregateLinks(
  rows: DataRow[],
  source: string,
  target: string,
  value: string
) {
  const links = new Map<
    string,
    { source: string; target: string; value: number }
  >();
  for (const row of rows) {
    const from = text(row[source]);
    const to = text(row[target]);
    if (!from || !to || from === to) continue;
    const key = `${from}\u0000${to}`;
    const link = links.get(key) ?? { source: from, target: to, value: 0 };
    link.value += number(row[value]) || 1;
    links.set(key, link);
  }
  return [...links.values()].map((link) => ({
    ...link,
    value: round(link.value)
  }));
}
function dateText(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 10);
}
function hasDirectedCycle(links: Array<{ source: string; target: string }>) {
  const graph = new Map<string, string[]>();
  for (const link of links)
    graph.set(link.source, [...(graph.get(link.source) ?? []), link.target]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    if ((graph.get(node) ?? []).some(visit)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...graph.keys()].some(visit);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
