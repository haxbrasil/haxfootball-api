import { describe, expect, it } from "bun:test";
import {
  normalizeHistoricalImportRow,
  parseHistoricalImport
} from "@/features/championships/history/import-parser";

describe("championship historical import parser", () => {
  it("parses quoted CSV fields, escaped quotes, CRLF, and a BOM", () => {
    const parsed = parseHistoricalImport(
      "csv",
      '\uFEFFentityType,sourceKey,name,note\r\nteam,t1,"Aurora, FC","said ""hello"""\r\n'
    );

    expect(parsed).toEqual({
      columns: ["entityType", "sourceKey", "name", "note"],
      rows: [
        {
          entityType: "team",
          sourceKey: "t1",
          name: "Aurora, FC",
          note: 'said "hello"'
        }
      ]
    });
  });

  it("parses a JSON array and a rows envelope", () => {
    const direct = parseHistoricalImport(
      "json",
      JSON.stringify([{ entityType: "team", sourceKey: "a", name: "A" }])
    );
    const envelope = parseHistoricalImport(
      "json",
      JSON.stringify({
        rows: [{ entityType: "team", sourceKey: "b", name: "B" }]
      })
    );

    expect(direct.columns).toEqual(["entityType", "sourceKey", "name"]);
    expect(envelope.rows[0]).toMatchObject({ sourceKey: "b" });
  });

  for (const [name, source] of [
    ["empty CSV", ""],
    ["duplicate CSV columns", "name,name\nA,B"],
    ["unterminated CSV quote", 'name\n"A'],
    ["invalid JSON", "{"],
    ["non-array JSON", '{"name":"A"}'],
    ["primitive JSON rows", "[1,2,3]"]
  ]) {
    it(`rejects ${name}`, () => {
      expect(() =>
        parseHistoricalImport(name.includes("JSON") ? "json" : "csv", source)
      ).toThrow();
    });
  }

  const validRows = [
    ["team-identity", { name: "Aurora", slug: "aurora" }],
    ["team", { name: "Aurora" }],
    ["historical-player", { displayName: "Player" }],
    ["participant", { displayName: "Player", historicalPlayerKey: "player" }],
    ["roster-membership", { teamKey: "a", participantKey: "p" }],
    ["stage", { name: "Group stage" }],
    ["match", { label: "A x B", sideATeamKey: "a", sideBTeamKey: "b" }],
    [
      "statistic",
      {
        matchKey: "m",
        participantKey: "p",
        metricKey: "goals",
        numericValue: 2
      }
    ],
    ["placement", { teamKey: "a", rank: 1 }],
    [
      "award",
      {
        kind: "mvp",
        targetType: "participant",
        targetKey: "p",
        displayLabel: "MVP"
      }
    ],
    [
      "record",
      {
        metricKey: "goals",
        targetType: "participant",
        targetKey: "p",
        numericValue: 10
      }
    ],
    ["unknown", { field: "legacy-column", rawValue: "?" }]
  ] as const;

  for (const [entityType, values] of validRows) {
    it(`normalizes a valid ${entityType} row`, () => {
      const normalized = normalizeHistoricalImportRow(
        { entityType, sourceKey: `${entityType}-1`, ...values },
        {}
      );

      expect(normalized.state).toBe("valid");
      expect(normalized.messages).toEqual([]);
      expect(normalized.entityType).toBe(entityType);
    });
  }

  for (let index = 0; index < 100; index += 1) {
    it(`preserves unmapped legacy value ${index + 1}`, () => {
      const normalized = normalizeHistoricalImportRow(
        {
          type: "team",
          id: `team-${index}`,
          old_name: `Team ${index}`,
          legacy_value: `legacy-${index}`
        },
        {
          entityTypeColumn: "type",
          fieldMap: {
            sourceKey: "id",
            name: "old_name"
          }
        }
      );

      expect(normalized).toMatchObject({
        state: "warning",
        entityType: "team",
        sourceKey: `team-${index}`,
        values: { name: `Team ${index}` },
        unmapped: { legacy_value: `legacy-${index}` }
      });
    });
  }
});
