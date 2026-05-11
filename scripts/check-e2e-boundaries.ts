const root = "test/e2e";

const allowedDirectories = new Set(["helpers", "fixtures"]);

const forbiddenImportPattern =
  /(?:from\s+["']@\/(?:app|db|features)\/?[^"']*["']|import\(["']@\/(?:app|db|features)\/?[^"']*["']\))/u;

const files = await e2eFiles(root);

const violationGroups = await Promise.all(
  files
    .filter((file) => !isAllowedSupportFile(file))
    .map((file) => fileViolations(file))
);

const violations = violationGroups.flat();

if (violations.length > 0) {
  console.error("E2E boundary violations found:");

  for (const violation of violations) {
    console.error(`- ${violation}`);
  }

  process.exit(1);
}

async function e2eFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const glob = new Bun.Glob(`${directory}/**/*.ts`);

  for await (const file of glob.scan()) {
    files.push(file);
  }

  return files;
}

function isAllowedSupportFile(file: string): boolean {
  const relativePath = file.slice(`${root}/`.length);
  const [directory] = relativePath.split("/");

  return allowedDirectories.has(directory);
}

async function fileViolations(file: string): Promise<string[]> {
  const source = await Bun.file(file).text();

  return source
    .split("\n")
    .flatMap((line, index) =>
      forbiddenImportPattern.test(line) ? [`${file}:${index + 1}: ${line}`] : []
    );
}

export {};
