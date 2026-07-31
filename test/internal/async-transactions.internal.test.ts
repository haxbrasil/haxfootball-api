import { describe, expect, it } from "bun:test";

describe("database transaction boundaries", () => {
  it("never passes an async callback to the synchronous Drizzle transaction API", async () => {
    const violations: string[] = [];
    const sourceFiles = new Bun.Glob("src/**/*.ts");

    for await (const path of sourceFiles.scan()) {
      const source = await Bun.file(path).text();

      if (/\.transaction\s*\(\s*async\b/.test(source)) {
        violations.push(path);
      }
    }

    expect(violations).toEqual([]);
  });
});
