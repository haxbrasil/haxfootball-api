import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/config/env";
import type {
  RoomInstance,
  RoomProgramVersion
} from "@/features/rooms/room.db";
import {
  detectRoomLink,
  type EffectiveRoomEnvironment
} from "@/features/rooms/room.service";

export type RoomProcessLaunchInput = {
  roomId: string;
  version: RoomProgramVersion;
  environment: EffectiveRoomEnvironment;
};

export type RoomProcessLaunchResult = {
  pid: number;
  processStartedAt: string;
  invocationId: string;
  logPath: string;
  roomLink?: string;
};

export type RoomProcessStatus = {
  alive: boolean;
  expected: boolean;
};

export async function launchRoomProcess(
  input: RoomProcessLaunchInput
): Promise<RoomProcessLaunchResult> {
  const packageRoot = await preparePackage(input.version);

  return env.roomProcessRunner === "node"
    ? launchNodeProcess(input, packageRoot)
    : launchBubblewrapProcess(input, packageRoot);
}

export function closeRoomProcess(room: RoomInstance): Promise<void> {
  if (!room.pid) {
    return Promise.resolve();
  }

  try {
    process.kill(room.pid, "SIGTERM");
  } catch {
    // The reconciler will mark already-gone processes closed.
  }

  return Promise.resolve();
}

export function inspectRoomProcess(
  room: RoomInstance
): Promise<RoomProcessStatus> {
  if (!room.pid) {
    return Promise.resolve({ alive: false, expected: false });
  }

  try {
    process.kill(room.pid, 0);

    return Promise.resolve({ alive: true, expected: true });
  } catch {
    return Promise.resolve({ alive: false, expected: false });
  }
}

async function preparePackage(version: RoomProgramVersion): Promise<string> {
  const packageRoot = join(env.roomPackageCacheDir, version.uuid);
  const entrypointPath = join(packageRoot, version.nodeEntrypoint);

  if (existsSync(entrypointPath)) {
    return packageRoot;
  }

  await mkdir(packageRoot, { recursive: true });

  const archivePath = join(packageRoot, version.artifact.assetName);
  const response = await fetch(version.artifact.assetUrl);

  if (!response.ok) {
    throw new Error(`Room package download failed: ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  await writeFile(archivePath, bytes);

  if (version.artifact.assetName.endsWith(".zip")) {
    execFileSync("unzip", ["-q", archivePath, "-d", packageRoot]);
  } else {
    execFileSync("tar", [
      "-xzf",
      archivePath,
      "-C",
      packageRoot,
      "--strip-components=1"
    ]);
  }

  if (version.installStrategy === "npm-ci") {
    execFileSync("npm", ["ci", "--omit=dev"], {
      cwd: packageRoot,
      stdio: "ignore"
    });
  }

  if (version.installStrategy === "npm-install") {
    execFileSync("npm", ["install", "--omit=dev"], {
      cwd: packageRoot,
      stdio: "ignore"
    });
  }

  return packageRoot;
}

async function launchNodeProcess(
  input: RoomProcessLaunchInput,
  packageRoot: string
): Promise<RoomProcessLaunchResult> {
  const invocationId = crypto.randomUUID();
  const roomRoot = join(env.roomProcessLogDir, input.roomId);
  const logPath = join(roomRoot, "room.log");

  await mkdir(roomRoot, { recursive: true });

  const logFd = openSync(logPath, "a");
  const childProcess = spawn("node", [input.version.nodeEntrypoint], {
    cwd: packageRoot,
    detached: true,
    env: input.environment,
    stdio: ["ignore", logFd, logFd]
  });

  closeSync(logFd);
  childProcess.unref();

  return {
    pid: childProcess.pid ?? 0,
    processStartedAt: new Date().toISOString(),
    invocationId,
    logPath,
    roomLink: await waitForRoomLink(logPath)
  };
}

async function launchBubblewrapProcess(
  input: RoomProcessLaunchInput,
  packageRoot: string
): Promise<RoomProcessLaunchResult> {
  const invocationId = crypto.randomUUID();
  const roomRoot = join(env.roomProcessLogDir, input.roomId);
  const logPath = join(roomRoot, "room.log");

  await mkdir(roomRoot, { recursive: true });

  const logFd = openSync(logPath, "a");
  const environmentArgs = Object.entries(input.environment).flatMap(
    ([key, value]) => ["--setenv", key, value]
  );

  const childProcess = spawn(
    "bwrap",
    [
      "--unshare-all",
      "--share-net",
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind-try",
      "/lib",
      "/lib",
      "--ro-bind-try",
      "/lib64",
      "/lib64",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--ro-bind",
      packageRoot,
      "/room",
      "--chdir",
      "/room",
      "--clearenv",
      ...environmentArgs,
      "node",
      input.version.nodeEntrypoint
    ],
    {
      detached: true,
      stdio: ["ignore", logFd, logFd]
    }
  );

  closeSync(logFd);
  childProcess.unref();

  return {
    pid: childProcess.pid ?? 0,
    processStartedAt: new Date().toISOString(),
    invocationId,
    logPath,
    roomLink: await waitForRoomLink(logPath)
  };
}

async function waitForRoomLink(logPath: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const log = await readLogFile(logPath);
    const roomLink = detectRoomLink(log);

    if (roomLink) {
      return roomLink;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return undefined;
}

async function readLogFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
