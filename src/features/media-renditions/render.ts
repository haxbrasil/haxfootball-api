import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { env } from "@/config/env";
import type { JobHandlerRegistry } from "@/features/jobs/_shared/domain/execution";
import { clips } from "@/features/clips/db";
import { recordings } from "@/features/recordings/db";
import { db } from "@/db/client";
import {
  claimMediaRendition,
  getMediaRenditionByUuid,
  markMediaRenditionReady,
  updateMediaRenditionStatus
} from "@/features/media-renditions/_shared/db/queries";
import { getR2ObjectBytes, putR2Object } from "@/shared/storage/r2";
import { sha256Hex } from "@/shared/crypto/sha256";
import type { JsonValue } from "@lib/json";
import {
  clipExportContentType,
  clipExportExtension
} from "@/features/clips/_shared/domain/exports";
import type { ClipExportProfile } from "@/features/media-renditions/db";

export const mediaRenderJobType = "media.render-clip-rendition";

export const mediaJobHandlers = {
  [mediaRenderJobType]: renderMediaRendition
} satisfies JobHandlerRegistry;

export async function renderMediaRendition(
  payload: unknown
): Promise<JsonValue> {
  const renditionId = readRenditionId(payload);
  const rendition = await getMediaRenditionByUuid(renditionId);

  if (!rendition) {
    throw new Error("Media rendition not found");
  }
  if (rendition.status === "ready" && rendition.objectKey) {
    return {
      renditionId: rendition.uuid,
      status: "ready",
      objectKey: rendition.objectKey,
      sizeBytes: rendition.sizeBytes ?? null
    };
  }

  const claimed = await claimMediaRendition(rendition.id);
  if (!claimed) {
    const current = await getMediaRenditionByUuid(renditionId);
    if (!current) {
      throw new Error("Media rendition not found");
    }
    return {
      renditionId: current.uuid,
      status: current.status,
      objectKey: current.objectKey,
      sizeBytes: current.sizeBytes ?? null
    };
  }

  const [source] = await db
    .select({ clip: clips, recording: recordings })
    .from(clips)
    .innerJoin(recordings, eq(clips.recordingId, recordings.id))
    .where(eq(clips.id, rendition.clipId));

  if (!source) {
    await markFailed(
      rendition.id,
      "source_not_found",
      "Clip recording not found"
    );
    throw new Error("Clip recording not found");
  }

  const workDir = join(env.mediaRenderTempDir, rendition.uuid);
  const inputPath = join(
    workDir,
    `source.${source.recording.format ?? "hbr2"}`
  );
  const outputExtension = outputExtensionFor(rendition);
  const outputPath = join(workDir, `rendition.${outputExtension}`);

  try {
    await mkdir(workDir, { recursive: true });
    await writeFile(
      inputPath,
      await getR2ObjectBytes(source.recording.objectKey)
    );

    const cameraProfilePath = rendition.exportProfile?.renderSettings
      ? join(workDir, "camera-profile.json")
      : null;
    if (cameraProfilePath && rendition.exportProfile?.renderSettings) {
      await writeFile(
        cameraProfilePath,
        JSON.stringify({
          base: rendition.exportProfile.renderSettings.camera.parameters,
          rules: rendition.exportProfile.renderSettings.camera.rules
        })
      );
    }
    const args = rendererArgs({
      inputPath,
      outputPath,
      purpose: rendition.purpose,
      exportProfile: rendition.exportProfile,
      cameraProfilePath,
      startTick: source.clip.startTick,
      endTick: source.clip.endTick
    });
    await runRenderer(args);

    const outputStat = await stat(outputPath);
    if (outputStat.size <= 0 || outputStat.size > env.mediaRenderMaxBytes) {
      throw new Error("Rendered media exceeded the output size limit");
    }

    const body = new Uint8Array(await readFile(outputPath));
    const outputMetadata = await verifyRenderedOutput({
      outputPath,
      purpose: rendition.purpose,
      expectedWidth: expectedDimensions(rendition).width,
      expectedHeight: expectedDimensions(rendition).height
    });
    const checksumSha256 = await sha256Hex(body);
    const objectKey = `media/clips/${rendition.cacheKey}.${outputExtension}`;
    const contentType = contentTypeFor(rendition);
    const expiresAt =
      rendition.purpose === "clip_export"
        ? new Date(Date.now() + env.clipExportTtlSeconds * 1000).toISOString()
        : null;
    await putR2Object({
      key: objectKey,
      body,
      contentType,
      cacheControl:
        rendition.purpose === "clip_export"
          ? `public, max-age=${env.clipExportTtlSeconds}`
          : "public, max-age=31536000, immutable"
    });

    await markMediaRenditionReady({
      id: claimed.id,
      objectKey,
      contentType,
      sizeBytes: body.byteLength,
      checksumSha256,
      width: outputMetadata.width,
      height: outputMetadata.height,
      durationTicks: source.clip.endTick - source.clip.startTick,
      rendererVersion: env.mediaRendererVersion,
      expiresAt
    });

    return {
      renditionId: rendition.uuid,
      status: "ready",
      objectKey,
      sizeBytes: body.byteLength
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(claimed.id, "render_failed", message);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function rendererArgs(input: {
  inputPath: string;
  outputPath: string;
  purpose: "clip_poster" | "clip_preview_video" | "clip_export";
  exportProfile: ClipExportProfile | null;
  cameraProfilePath: string | null;
  startTick: number;
  endTick: number;
}): string[] {
  if (input.purpose === "clip_poster") {
    return [
      "snapshot",
      input.inputPath,
      input.outputPath,
      "--frame",
      String(input.startTick),
      "--width",
      "1280",
      "--height",
      "720"
    ];
  }

  const profile = input.exportProfile;
  const args = [
    "convert",
    input.inputPath,
    input.outputPath,
    "--format",
    profile?.format ?? "mp4",
    "--width",
    profile?.orientation === "vertical" ? "1080" : "1280",
    "--height",
    profile?.orientation === "vertical" ? "1920" : "720",
    "--fps",
    "30",
    "--start-frame",
    String(input.startTick),
    "--end-frame",
    String(input.endTick - 1),
    "--no-audio"
  ];
  if (profile?.orientation === "vertical") {
    args.push("--preset", "vertical");
  }
  if (profile?.renderSettings) {
    if (!input.cameraProfilePath) {
      throw new Error("Export camera profile is missing");
    }
    args.push(
      "--camera",
      "custom",
      "--zoom",
      String(profile.renderSettings.camera.zoom),
      "--hud-zoom",
      String(profile.renderSettings.camera.hudZoom),
      "--scoreboard-zoom",
      String(profile.renderSettings.camera.scoreboardZoom),
      "--menu-zoom",
      String(profile.renderSettings.camera.menuZoom),
      "--location-indicator-zoom",
      String(profile.renderSettings.camera.locationIndicatorZoom),
      "--game-message-zoom",
      String(profile.renderSettings.camera.gameMessageZoom),
      "--camera-profile",
      input.cameraProfilePath
    );
  }
  if (profile?.scoreboard === "none") {
    args.push("--no-scoreboard");
  } else if (profile?.scoreboard) {
    args.push("--scoreboard-style", profile.scoreboard);
  }
  return args;
}

async function runRenderer(args: string[]): Promise<void> {
  const result = await runProcess(env.mediaRendererBinary, args);
  if (result.exitCode !== 0) {
    throw new Error(
      `Replay renderer exited with status ${result.exitCode}${result.stderr ? `: ${result.stderr.trim()}` : ""}`
    );
  }
}

async function verifyRenderedOutput(input: {
  outputPath: string;
  purpose: "clip_poster" | "clip_preview_video" | "clip_export";
  expectedWidth: number;
  expectedHeight: number;
}): Promise<{ width: number; height: number }> {
  if (input.purpose === "clip_poster") {
    const bytes = await readFile(input.outputPath);
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!pngSignature.every((byte, index) => bytes[index] === byte)) {
      throw new Error("Renderer produced an invalid PNG poster");
    }
    return { width: input.expectedWidth, height: input.expectedHeight };
  }

  const probe = await runProcess(env.mediaRendererProbeBinary, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_type,width,height,duration:format=duration",
    "-of",
    "json",
    input.outputPath
  ]);
  if (probe.exitCode !== 0) {
    throw new Error(
      `Rendered MP4 could not be inspected${probe.stderr ? `: ${probe.stderr.trim()}` : ""}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(probe.stdout);
  } catch {
    throw new Error("Rendered MP4 inspection returned invalid metadata");
  }
  const stream = readVideoStream(parsed);
  if (
    stream.width !== input.expectedWidth ||
    stream.height !== input.expectedHeight ||
    !Number.isFinite(stream.duration) ||
    stream.duration <= 0
  ) {
    throw new Error(
      "Rendered MP4 metadata does not describe the expected video"
    );
  }

  return { width: stream.width, height: stream.height };
}

function readVideoStream(value: unknown): {
  width: number;
  height: number;
  duration: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rendered MP4 metadata is missing");
  }
  const record = value as {
    streams?: Array<{
      codec_type?: unknown;
      width?: unknown;
      height?: unknown;
      duration?: unknown;
    }>;
    format?: { duration?: unknown };
  };
  const stream = record.streams?.find(
    (candidate) => candidate.codec_type === "video"
  );
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  const duration = Number(stream?.duration ?? record.format?.duration);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new Error("Rendered MP4 dimensions are missing");
  }
  return { width, height, duration };
}

async function runProcess(
  command: string,
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout = `${stdout}${chunk}`.slice(-32_000);
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, env.mediaRenderTimeoutSeconds * 1000);
  const killTimer = setTimeout(
    () => {
      if (timedOut) child.kill("SIGKILL");
    },
    env.mediaRenderTimeoutSeconds * 1000 + 5_000
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  }).finally(() => {
    clearTimeout(timeout);
    clearTimeout(killTimer);
  });

  if (timedOut) {
    throw new Error(
      `Media renderer timed out after ${env.mediaRenderTimeoutSeconds} seconds`
    );
  }

  return { exitCode, stdout, stderr };
}

async function markFailed(id: number, errorCode: string, errorMessage: string) {
  await updateMediaRenditionStatus({
    id,
    status: "failed",
    errorCode,
    errorMessage: errorMessage.slice(0, 1000)
  });
}

function outputExtensionFor(rendition: {
  purpose: "clip_poster" | "clip_preview_video" | "clip_export";
  exportProfile: ClipExportProfile | null;
}): string {
  if (rendition.purpose === "clip_poster") return "png";
  if (rendition.purpose === "clip_export" && rendition.exportProfile) {
    return clipExportExtension(rendition.exportProfile.format);
  }
  return "mp4";
}

function contentTypeFor(rendition: {
  purpose: "clip_poster" | "clip_preview_video" | "clip_export";
  exportProfile: ClipExportProfile | null;
}): string {
  if (rendition.purpose === "clip_poster") return "image/png";
  if (rendition.purpose === "clip_export" && rendition.exportProfile) {
    return clipExportContentType(rendition.exportProfile.format);
  }
  return "video/mp4";
}

function expectedDimensions(rendition: {
  purpose: "clip_poster" | "clip_preview_video" | "clip_export";
  exportProfile: ClipExportProfile | null;
}): { width: number; height: number } {
  if (rendition.purpose === "clip_poster") return { width: 1280, height: 720 };
  return rendition.exportProfile?.orientation === "vertical"
    ? { width: 1080, height: 1920 }
    : { width: 1280, height: 720 };
}

function readRenditionId(payload: unknown): string {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    typeof (payload as { renditionId?: unknown }).renditionId !== "string"
  ) {
    throw new Error("Media rendition job payload is invalid");
  }

  return (payload as { renditionId: string }).renditionId;
}
