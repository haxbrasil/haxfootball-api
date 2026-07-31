import { validateAsync } from "@hax-brasil/replay-decoder";

export async function inspectRecordingBytes(bytes: Uint8Array): Promise<{
  state: "playable" | "invalid" | "unsupported";
  issues: Array<{
    code: string;
    severity: "error" | "warning";
    path: string;
    message: string;
  }>;
}> {
  let issues: Awaited<ReturnType<typeof validateAsync>>["issues"];

  try {
    issues = (await validateAsync(bytes, "structural")).issues;
  } catch (error) {
    issues = [
      {
        code: "decoder-unavailable",
        severity: "error",
        path: "$",
        message: error instanceof Error ? error.message : "Decoder failed"
      }
    ];
  }

  const state = issues.some((issue) => issue.severity === "error")
    ? issues.some((issue) => /unsupported|unknown-version/i.test(issue.code))
      ? "unsupported"
      : "invalid"
    : "playable";

  return { state, issues };
}
