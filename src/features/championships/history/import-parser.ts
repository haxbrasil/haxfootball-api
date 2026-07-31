export const historicalImportEntityTypes = [
  "team-identity",
  "team",
  "historical-player",
  "participant",
  "roster-membership",
  "stage",
  "match",
  "statistic",
  "placement",
  "award",
  "record",
  "unknown"
] as const;

export type HistoricalImportEntityType =
  (typeof historicalImportEntityTypes)[number];

export type HistoricalImportMapping = {
  entityTypeColumn?: string | null;
  defaultEntityType?: HistoricalImportEntityType | null;
  fieldMap?: Record<string, string>;
};

export type ParsedHistoricalImport = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

export type NormalizedHistoricalImportRow = {
  entityType: HistoricalImportEntityType | null;
  sourceKey: string | null;
  values: Record<string, unknown>;
  unmapped: Record<string, unknown>;
  messages: string[];
  state: "valid" | "warning" | "invalid";
};

const canonicalFields = new Set([
  "entityType",
  "sourceKey",
  "key",
  "name",
  "slug",
  "abbreviation",
  "colors",
  "identityKey",
  "seed",
  "displayOrder",
  "displayName",
  "displayLabel",
  "aliases",
  "notes",
  "accountUuid",
  "historicalPlayerKey",
  "status",
  "registeredAt",
  "teamKey",
  "participantKey",
  "role",
  "priceUnits",
  "effectiveToRevision",
  "startedAt",
  "endedAt",
  "engine",
  "stageKey",
  "label",
  "sideATeamKey",
  "sideBTeamKey",
  "sideAScore",
  "sideBScore",
  "sideAOutcome",
  "sideBOutcome",
  "playedAt",
  "bracket",
  "note",
  "matchKey",
  "metricKey",
  "numericValue",
  "textValue",
  "rank",
  "kind",
  "targetType",
  "targetKey",
  "awardedAt",
  "relatedEntityType",
  "relatedEntityUuid",
  "field",
  "rawValue"
]);

export function parseHistoricalImport(
  format: "csv" | "json",
  source: string
): ParsedHistoricalImport {
  if (format === "json") return parseJson(source);
  return parseCsv(source);
}

export function normalizeHistoricalImportRow(
  raw: Record<string, unknown>,
  mapping: HistoricalImportMapping
): NormalizedHistoricalImportRow {
  const fieldMap = mapping.fieldMap ?? {};
  const mappedColumns = new Set(Object.values(fieldMap));
  if (mapping.entityTypeColumn) mappedColumns.add(mapping.entityTypeColumn);
  const values = Object.fromEntries(
    Object.entries(fieldMap).map(([field, column]) => [field, raw[column]])
  );

  for (const [field, value] of Object.entries(raw)) {
    if (!(field in values) && !(field in fieldMap)) values[field] = value;
  }

  const rawType = mapping.entityTypeColumn
    ? raw[mapping.entityTypeColumn]
    : values.entityType;
  const entityType =
    normalizeEntityType(rawType) ?? mapping.defaultEntityType ?? null;
  const sourceKey = stringValue(values.sourceKey ?? values.key);
  const messages = validateNormalizedRow(entityType, sourceKey, values);
  const unmapped = Object.fromEntries(
    Object.entries(raw).filter(([column, value]) => {
      return (
        !mappedColumns.has(column) &&
        !canonicalFields.has(column) &&
        value !== ""
      );
    })
  );
  const state = messages.some((message) => message.startsWith("Erro:"))
    ? "invalid"
    : unmapped && Object.keys(unmapped).length > 0
      ? "warning"
      : "valid";

  return {
    entityType,
    sourceKey,
    values,
    unmapped,
    messages:
      state === "warning"
        ? [...messages, "Campos não mapeados serão preservados."]
        : messages,
    state
  };
}

function parseJson(source: string): ParsedHistoricalImport {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The JSON source is not valid");
  }

  const rows = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.rows)
      ? value.rows
      : null;
  if (!rows) {
    throw new Error(
      "JSON imports must be an array or an object with a rows array"
    );
  }
  if (!rows.every(isRecord)) {
    throw new Error("Every JSON import row must be an object");
  }

  return {
    columns: [...new Set(rows.flatMap((row) => Object.keys(row)))],
    rows
  };
}

function parseCsv(source: string): ParsedHistoricalImport {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }
  if (quoted)
    throw new Error("The CSV source has an unterminated quoted field");
  row.push(cell);
  if (row.some((value) => value.length > 0)) records.push(row);
  if (records.length === 0) throw new Error("The CSV source is empty");

  const columns = records[0]!.map((column, index) => {
    const normalized = column.trim().replace(/^\uFEFF/, "");
    return normalized || `column_${index + 1}`;
  });
  if (new Set(columns).size !== columns.length) {
    throw new Error("CSV column names must be unique");
  }

  return {
    columns,
    rows: records
      .slice(1)
      .map((values) =>
        Object.fromEntries(
          columns.map((column, index) => [column, values[index] ?? ""])
        )
      )
  };
}

function validateNormalizedRow(
  entityType: HistoricalImportEntityType | null,
  sourceKey: string | null,
  values: Record<string, unknown>
) {
  const messages: string[] = [];
  const required = (...fields: string[]) => {
    for (const field of fields) {
      if (stringValue(values[field]) === null) {
        messages.push(`Erro: o campo ${field} é obrigatório.`);
      }
    }
  };

  if (!entityType) {
    return ["Erro: o tipo de entidade não é reconhecido."];
  }
  if (!sourceKey && entityType !== "unknown") {
    messages.push("Erro: o campo sourceKey é obrigatório.");
  }

  switch (entityType) {
    case "team-identity":
      required("name", "slug");
      break;
    case "team":
      required("name");
      break;
    case "historical-player":
      required("displayName");
      break;
    case "participant":
      required("displayName");
      if (
        !stringValue(values.accountUuid) &&
        !stringValue(values.historicalPlayerKey)
      ) {
        messages.push(
          "Erro: participante exige accountUuid ou historicalPlayerKey."
        );
      }
      break;
    case "roster-membership":
      required("teamKey", "participantKey");
      if (!["gm", "player"].includes(stringValue(values.role) ?? "player")) {
        messages.push("Erro: role deve ser gm ou player.");
      }
      break;
    case "stage":
      required("name");
      break;
    case "match":
      required("label", "sideATeamKey", "sideBTeamKey");
      break;
    case "statistic":
      required("matchKey", "metricKey", "numericValue");
      if (!stringValue(values.participantKey) && !stringValue(values.teamKey)) {
        messages.push("Erro: estatística exige participantKey ou teamKey.");
      }
      break;
    case "placement":
      required("teamKey", "rank");
      break;
    case "award":
      required("kind", "targetType", "targetKey", "displayLabel");
      break;
    case "record":
      required("metricKey", "targetType", "targetKey");
      if (
        stringValue(values.numericValue) === null &&
        stringValue(values.textValue) === null
      ) {
        messages.push("Erro: record exige numericValue ou textValue.");
      }
      break;
    case "unknown":
      required("field");
      break;
  }

  return messages;
}

function normalizeEntityType(value: unknown) {
  const normalized = stringValue(value)?.toLowerCase().replaceAll("_", "-");
  return (
    historicalImportEntityTypes.find((type) => type === normalized) ?? null
  );
}

export function stringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function integerValue(value: unknown): number | null {
  const normalized = stringValue(value);
  if (normalized === null) return null;
  const number = Number(normalized);
  return Number.isInteger(number) ? number : null;
}

export function numberValue(value: unknown): number | null {
  const normalized = stringValue(value);
  if (normalized === null) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
