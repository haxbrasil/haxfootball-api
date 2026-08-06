import type {
  ClipExportFormat,
  ClipExportOrientation,
  ClipExportProfile,
  ClipExportScoreboard
} from "@/features/media-renditions/db";

export const clipExportFormats = [
  "mp4",
  "webm",
  "gif"
] as const satisfies readonly ClipExportFormat[];
export const clipExportOrientations = [
  "landscape",
  "vertical"
] as const satisfies readonly ClipExportOrientation[];
export const clipExportScoreboards = [
  "default",
  "compact",
  "score-only",
  "time-only",
  "floating-default",
  "floating-compact",
  "floating-score-only",
  "floating-time-only",
  "floating-score-time-right",
  "none"
] as const satisfies readonly ClipExportScoreboard[];

export const defaultClipExportProfile: ClipExportProfile = {
  format: "mp4",
  orientation: "landscape",
  scoreboard: "default"
};

export function clipExportProfileKey(profile: ClipExportProfile): string {
  return `${profile.format}:${profile.orientation}:${profile.scoreboard}`;
}

export function clipExportExtension(format: ClipExportFormat): string {
  return format;
}

export function clipExportContentType(format: ClipExportFormat): string {
  switch (format) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "gif":
      return "image/gif";
  }
}
