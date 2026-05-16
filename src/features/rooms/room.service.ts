import type {
  RoomInstance,
  RoomLaunchConfig,
  RoomLaunchConfigField,
  RoomProgram,
  RoomProxyEndpoint
} from "@/features/rooms/room.db";
import { defaultLaunchConfigFields } from "@/features/rooms/room.contract";
import type { GitHubRelease } from "@/features/rooms/github-release.service";
import { badRequest } from "@/shared/http/errors";

export type EffectiveRoomEnvironment = Record<string, string>;
export type RoomPublicPolicy = "default" | "force-private";

export type ResolveLaunchConfigInput = {
  fields: RoomLaunchConfigField[];
  values: RoomLaunchConfig;
  assignedProxy: RoomProxyEndpoint | null;
  publicPolicy?: RoomPublicPolicy;
};

export type ResolveLaunchConfigResult = {
  sanitizedLaunchConfig: RoomLaunchConfig;
  environmentValues: RoomLaunchConfig;
  publicRoom: boolean;
};

export type BuildEffectiveRoomEnvironmentInput = {
  program: RoomProgram;
  fields: RoomLaunchConfigField[];
  environmentValues: RoomLaunchConfig;
  haxballToken: string;
  roomId: string;
  roomApiUrl: string;
  roomApiJwt: string;
  commId: string;
};

export type ChooseProxyEndpointInput = {
  endpoints: RoomProxyEndpoint[];
  openRooms: RoomInstance[];
  requestedProxy: string | undefined;
  publicRoom: boolean;
};

export type ReleaseAsset = {
  name: string;
  downloadUrl: string;
};

export function normalizeLaunchConfigFields(
  fields: RoomLaunchConfigField[] | undefined
): RoomLaunchConfigField[] {
  assertLaunchConfigFields(fields ?? []);

  const byKey = new Map<string, RoomLaunchConfigField>();

  for (const field of defaultLaunchConfigFields) {
    byKey.set(field.key, field);
  }

  for (const field of fields ?? []) {
    byKey.set(field.key, {
      ...field,
      secret: field.secret ?? false
    });
  }

  const normalized = Array.from(byKey.values());
  assertLaunchConfigFields(normalized);

  return normalized;
}

export function assertLaunchConfigFields(
  fields: RoomLaunchConfigField[]
): void {
  const keys = new Set<string>();
  const envVars = new Set<string>();

  for (const field of fields) {
    if (keys.has(field.key)) {
      throw badRequest("Launch config field keys must be unique");
    }

    if (envVars.has(field.envVar)) {
      throw badRequest("Launch config environment variables must be unique");
    }

    if (field.enumValues && field.valueType !== "string") {
      throw badRequest("Launch config enum fields must use string values");
    }

    if (
      field.defaultValue !== undefined &&
      field.defaultValue !== null &&
      typeof field.defaultValue !== field.valueType
    ) {
      throw badRequest("Launch config default value type does not match field");
    }

    keys.add(field.key);
    envVars.add(field.envVar);
  }
}

export function resolveLaunchConfig(
  input: ResolveLaunchConfigInput
): ResolveLaunchConfigResult {
  const sanitizedLaunchConfig: RoomLaunchConfig = {};
  const environmentValues: RoomLaunchConfig = {};

  for (const field of input.fields) {
    const rawValue =
      field.key === "proxy" && input.assignedProxy
        ? input.assignedProxy.proxyUrl
        : (input.values[field.key] ?? field.defaultValue);
    const value =
      field.key === "roomPublic" && input.publicPolicy === "force-private"
        ? false
        : rawValue;

    if (value === undefined || value === null || value === "") {
      if (field.required) {
        throw badRequest(`Launch config field '${field.key}' is required`);
      }

      continue;
    }

    assertLaunchConfigValue(field, value);

    environmentValues[field.key] = value;
    sanitizedLaunchConfig[field.key] = field.secret ? null : value;
  }

  const publicRoom = Boolean(environmentValues.roomPublic ?? true);

  return {
    sanitizedLaunchConfig,
    environmentValues,
    publicRoom
  };
}

export function buildEffectiveRoomEnvironment(
  input: BuildEffectiveRoomEnvironmentInput
): EffectiveRoomEnvironment {
  const environment: EffectiveRoomEnvironment = {
    [input.program.haxballTokenEnvVar]: input.haxballToken
  };

  if (input.program.integrationMode === "integrated") {
    environment.__ROOM_API_URL = input.roomApiUrl;
    environment.__ROOM_API_JWT = input.roomApiJwt;
    environment.__ROOM_ID = input.roomId;
    environment.__ROOM_COMM_ID = input.commId;
  }

  for (const field of input.fields) {
    const value = input.environmentValues[field.key];

    if (value === undefined || value === null) {
      continue;
    }

    environment[field.envVar] = stringifyEnvironmentValue(value);
  }

  return environment;
}

export function chooseProxyEndpoint(
  input: ChooseProxyEndpointInput
): RoomProxyEndpoint | null {
  const enabledEndpoints = input.endpoints.filter(
    (endpoint) => endpoint.enabled
  );

  if (input.requestedProxy) {
    const endpoint = enabledEndpoints.find(
      (candidate) =>
        candidate.key === input.requestedProxy ||
        candidate.uuid === input.requestedProxy ||
        candidate.proxyUrl === input.requestedProxy
    );

    if (!endpoint) {
      throw badRequest("Requested proxy endpoint is not available");
    }

    return endpoint;
  }

  if (enabledEndpoints.length === 0) {
    return null;
  }

  const usageByEndpoint = new Map<
    number,
    { public: number; private: number }
  >();

  for (const endpoint of enabledEndpoints) {
    usageByEndpoint.set(endpoint.id, { public: 0, private: 0 });
  }

  for (const room of input.openRooms) {
    if (!room.proxyEndpointId || !usageByEndpoint.has(room.proxyEndpointId)) {
      continue;
    }

    const usage = usageByEndpoint.get(room.proxyEndpointId);

    if (!usage) {
      continue;
    }

    if (room.public) {
      usage.public += 1;
    } else {
      usage.private += 1;
    }
  }

  const allowedEndpoints = enabledEndpoints.filter((endpoint) => {
    const usage = usageByEndpoint.get(endpoint.id) ?? { public: 0, private: 0 };

    if (!input.publicRoom && usage.public === 0) {
      return true;
    }

    return usage.public + usage.private + 1 <= 2;
  });

  if (allowedEndpoints.length === 0) {
    throw badRequest("No proxy endpoint has available HaxBall capacity");
  }

  return allowedEndpoints.toSorted((left, right) => {
    const leftUsage = usageByEndpoint.get(left.id) ?? { public: 0, private: 0 };
    const rightUsage = usageByEndpoint.get(right.id) ?? {
      public: 0,
      private: 0
    };

    if (input.publicRoom) {
      return (
        rightUsage.public - leftUsage.public ||
        leftUsage.private - rightUsage.private ||
        left.id - right.id
      );
    }

    return (
      rightUsage.private - leftUsage.private ||
      leftUsage.public - rightUsage.public ||
      left.id - right.id
    );
  })[0];
}

export function matchReleaseAsset(
  release: GitHubRelease,
  assetPattern: string
): ReleaseAsset | null {
  const pattern = assetPattern.replace("{tag}", release.tagName);

  return (
    release.assets.find((asset) => asset.name === pattern) ??
    release.assets.find((asset) => asset.name.includes(pattern)) ??
    null
  );
}

export function latestStableRelease(
  releases: GitHubRelease[]
): GitHubRelease | null {
  const stableReleases = releases.filter(
    (release) => !release.draft && !release.prerelease
  );

  return (
    stableReleases.toSorted(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
    )[0] ?? null
  );
}

export function detectRoomLink(output: string): string | null {
  const match = /https:\/\/www\.haxball\.com\/play\?c=[A-Za-z0-9_-]+/u.exec(
    output
  );

  return match?.[0] ?? null;
}

function assertLaunchConfigValue(
  field: RoomLaunchConfigField,
  value: string | number | boolean
): void {
  if (typeof value !== field.valueType) {
    throw badRequest(`Launch config field '${field.key}' has invalid type`);
  }

  if (field.enumValues && !field.enumValues.includes(String(value))) {
    throw badRequest(`Launch config field '${field.key}' has invalid value`);
  }

  if (typeof value === "number") {
    if (field.minimum !== undefined && value < field.minimum) {
      throw badRequest(`Launch config field '${field.key}' is below minimum`);
    }

    if (field.maximum !== undefined && value > field.maximum) {
      throw badRequest(`Launch config field '${field.key}' is above maximum`);
    }
  }
}

function stringifyEnvironmentValue(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return String(value);
}
