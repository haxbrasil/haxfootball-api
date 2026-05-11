import { type Static, t } from "elysia";
import type {
  RoomInstance,
  RoomLaunchConfig,
  RoomLaunchConfigField,
  RoomProgram,
  RoomProgramReleaseSource,
  RoomProgramVersion,
  RoomProgramVersionArtifact,
  RoomProxyEndpoint
} from "@/features/rooms/room.db";

export const roomUuidSchema = t.String({ format: "uuid" });

export const roomSlugSchema = t.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z][a-z0-9-]{0,63}$"
});

const roomLaunchConfigKeySchema = t.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z][A-Za-z0-9]{0,63}$"
});

const envVarSchema = t.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[A-Z_][A-Z0-9_]*$"
});

const launchConfigValueSchema = t.Union([
  t.String(),
  t.Number(),
  t.Boolean(),
  t.Null()
]);

export const roomLaunchConfigFieldSchema = t.Object({
  key: roomLaunchConfigKeySchema,
  displayName: t.String({ minLength: 1, maxLength: 80 }),
  valueType: t.Union([
    t.Literal("string"),
    t.Literal("number"),
    t.Literal("boolean")
  ]),
  required: t.Boolean(),
  defaultValue: t.Optional(launchConfigValueSchema),
  enumValues: t.Optional(t.Array(t.String({ minLength: 1 }), { minItems: 1 })),
  minimum: t.Optional(t.Number()),
  maximum: t.Optional(t.Number()),
  description: t.Optional(t.String({ minLength: 1 })),
  secret: t.Boolean({ default: false }),
  envVar: envVarSchema
});

export const roomProgramReleaseSourceSchema = t.Object({
  owner: t.String({ minLength: 1, maxLength: 80 }),
  repo: t.String({ minLength: 1, maxLength: 100 }),
  assetPattern: t.String({ minLength: 1, maxLength: 200 })
});

export const roomProgramResponseSchema = t.Object({
  id: roomUuidSchema,
  name: roomSlugSchema,
  title: t.Nullable(t.String()),
  description: t.Nullable(t.String()),
  releaseSource: roomProgramReleaseSourceSchema,
  launchConfigFields: t.Array(roomLaunchConfigFieldSchema),
  supportsManualLinking: t.Boolean(),
  haxballTokenEnvVar: envVarSchema,
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listRoomProgramsResponseSchema = t.Array(
  roomProgramResponseSchema
);

export const roomProgramIdParamsSchema = t.Object({
  id: roomUuidSchema
});

export const createRoomProgramBodySchema = t.Object({
  name: roomSlugSchema,
  title: t.Optional(t.String({ minLength: 1 })),
  description: t.Optional(t.String({ minLength: 1 })),
  releaseSource: roomProgramReleaseSourceSchema,
  launchConfigFields: t.Optional(t.Array(roomLaunchConfigFieldSchema)),
  supportsManualLinking: t.Optional(t.Boolean()),
  haxballTokenEnvVar: t.Optional(envVarSchema)
});

export const updateRoomProgramBodySchema = t.Partial(
  t.Object({
    title: t.Nullable(t.String({ minLength: 1 })),
    description: t.Nullable(t.String({ minLength: 1 })),
    releaseSource: roomProgramReleaseSourceSchema,
    launchConfigFields: t.Array(roomLaunchConfigFieldSchema),
    supportsManualLinking: t.Boolean(),
    haxballTokenEnvVar: envVarSchema
  })
);

export const roomProgramVersionArtifactSchema = t.Object({
  releaseId: t.String({ minLength: 1 }),
  tagName: t.String({ minLength: 1 }),
  assetName: t.String({ minLength: 1 }),
  assetUrl: t.String({ minLength: 1 }),
  publishedAt: t.String({ minLength: 1 }),
  checksumSha256: t.Optional(t.String({ minLength: 64, maxLength: 64 }))
});

export const roomProgramVersionResponseSchema = t.Object({
  id: roomUuidSchema,
  programId: roomUuidSchema,
  version: t.String({ minLength: 1 }),
  artifact: roomProgramVersionArtifactSchema,
  nodeEntrypoint: t.String({ minLength: 1 }),
  installStrategy: t.Union([
    t.Literal("none"),
    t.Literal("npm-ci"),
    t.Literal("npm-install")
  ]),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listRoomProgramVersionsResponseSchema = t.Array(
  roomProgramVersionResponseSchema
);

export const createRoomProgramVersionBodySchema = t.Object({
  version: t.String({ minLength: 1, maxLength: 80 }),
  artifact: roomProgramVersionArtifactSchema,
  nodeEntrypoint: t.String({ minLength: 1, maxLength: 240 }),
  installStrategy: t.Optional(
    t.Union([t.Literal("none"), t.Literal("npm-ci"), t.Literal("npm-install")])
  )
});

export const discoverRoomProgramVersionsBodySchema = t.Object({
  nodeEntrypoint: t.String({ minLength: 1, maxLength: 240 }),
  installStrategy: t.Optional(
    t.Union([t.Literal("none"), t.Literal("npm-ci"), t.Literal("npm-install")])
  )
});

export const roomProxyEndpointResponseSchema = t.Object({
  id: roomUuidSchema,
  key: roomSlugSchema,
  displayName: t.String(),
  outboundIp: t.String(),
  proxyUrl: t.String(),
  enabled: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listRoomProxyEndpointsResponseSchema = t.Array(
  roomProxyEndpointResponseSchema
);

export const roomProxyEndpointIdParamsSchema = t.Object({
  id: roomUuidSchema
});

export const createRoomProxyEndpointBodySchema = t.Object({
  key: roomSlugSchema,
  displayName: t.String({ minLength: 1 }),
  outboundIp: t.String({ minLength: 1 }),
  proxyUrl: t.String({ minLength: 1 }),
  enabled: t.Optional(t.Boolean())
});

export const updateRoomProxyEndpointBodySchema = t.Partial(
  t.Object({
    displayName: t.String({ minLength: 1 }),
    outboundIp: t.String({ minLength: 1 }),
    proxyUrl: t.String({ minLength: 1 }),
    enabled: t.Boolean()
  })
);

const roomLaunchConfigSchema = t.Record(t.String(), launchConfigValueSchema);

export const createRoomBodySchema = t.Object({
  programId: roomUuidSchema,
  version: t.String({ minLength: 1 }),
  haxballToken: t.String({ minLength: 1 }),
  launchConfig: t.Optional(roomLaunchConfigSchema)
});

export const roomResponseSchema = t.Object({
  id: roomUuidSchema,
  program: t.Object({
    id: roomUuidSchema,
    name: t.String(),
    title: t.Nullable(t.String())
  }),
  version: t.Object({
    id: roomUuidSchema,
    version: t.String()
  }),
  state: t.Union([
    t.Literal("provisioning"),
    t.Literal("running"),
    t.Literal("closed")
  ]),
  roomLink: t.Nullable(t.String()),
  launchConfig: roomLaunchConfigSchema,
  public: t.Boolean(),
  proxyEndpoint: t.Nullable(
    t.Object({
      id: roomUuidSchema,
      key: t.String(),
      displayName: t.String(),
      outboundIp: t.String(),
      proxyUrl: t.String()
    })
  ),
  createdAt: t.String(),
  updatedAt: t.String(),
  closedAt: t.Nullable(t.String())
});

export const listRoomsResponseSchema = t.Array(roomResponseSchema);

export const roomIdParamsSchema = t.Object({
  id: roomUuidSchema
});

export const listRoomsQuerySchema = t.Object({
  state: t.Optional(
    t.Union([
      t.Literal("open"),
      t.Literal("provisioning"),
      t.Literal("running"),
      t.Literal("closed"),
      t.Literal("all")
    ])
  )
});

export const reportRoomReadyBodySchema = t.Object({
  commId: t.String({ minLength: 32 }),
  roomLink: t.String({ minLength: 1 })
});

export type RoomProgramResponse = Static<typeof roomProgramResponseSchema>;
export type CreateRoomProgramInput = Static<typeof createRoomProgramBodySchema>;
export type UpdateRoomProgramInput = Static<typeof updateRoomProgramBodySchema>;
export type RoomProgramVersionResponse = Static<
  typeof roomProgramVersionResponseSchema
>;
export type CreateRoomProgramVersionInput = Static<
  typeof createRoomProgramVersionBodySchema
>;
export type DiscoverRoomProgramVersionsInput = Static<
  typeof discoverRoomProgramVersionsBodySchema
>;
export type RoomProxyEndpointResponse = Static<
  typeof roomProxyEndpointResponseSchema
>;
export type CreateRoomProxyEndpointInput = Static<
  typeof createRoomProxyEndpointBodySchema
>;
export type UpdateRoomProxyEndpointInput = Static<
  typeof updateRoomProxyEndpointBodySchema
>;
export type CreateRoomInput = Static<typeof createRoomBodySchema>;
export type RoomResponse = Static<typeof roomResponseSchema>;
export type ListRoomsQuery = Static<typeof listRoomsQuerySchema>;
export type ReportRoomReadyInput = Static<typeof reportRoomReadyBodySchema>;

export const defaultLaunchConfigFields: RoomLaunchConfigField[] = [
  {
    key: "roomName",
    displayName: "Room name",
    valueType: "string",
    required: false,
    secret: false,
    envVar: "ROOM_NAME"
  },
  {
    key: "proxy",
    displayName: "Proxy",
    valueType: "string",
    required: false,
    secret: false,
    envVar: "PROXY"
  },
  {
    key: "roomPublic",
    displayName: "Public room",
    valueType: "boolean",
    required: false,
    defaultValue: true,
    secret: false,
    envVar: "ROOM_PUBLIC"
  }
];

export function toRoomProgramResponse(
  program: RoomProgram
): RoomProgramResponse {
  return {
    id: program.uuid,
    name: program.name,
    title: program.title,
    description: program.description,
    releaseSource: program.releaseSource,
    launchConfigFields: program.launchConfigFields,
    supportsManualLinking: program.supportsManualLinking,
    haxballTokenEnvVar: program.haxballTokenEnvVar,
    createdAt: program.createdAt,
    updatedAt: program.updatedAt
  };
}

export function toRoomProgramVersionResponse(
  version: RoomProgramVersion,
  program: RoomProgram
): RoomProgramVersionResponse {
  return {
    id: version.uuid,
    programId: program.uuid,
    version: version.version,
    artifact: version.artifact,
    nodeEntrypoint: version.nodeEntrypoint,
    installStrategy: version.installStrategy,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt
  };
}

export function toRoomProxyEndpointResponse(
  endpoint: RoomProxyEndpoint
): RoomProxyEndpointResponse {
  return {
    id: endpoint.uuid,
    key: endpoint.key,
    displayName: endpoint.displayName,
    outboundIp: endpoint.outboundIp,
    proxyUrl: endpoint.proxyUrl,
    enabled: endpoint.enabled,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt
  };
}

export type RoomResponseProgramSummary = {
  id: string;
  name: string;
  title: string | null;
};
export type RoomResponseVersionSummary = {
  id: string;
  version: string;
};
export type RoomResponseProxyEndpointSummary = {
  id: string;
  key: string;
  displayName: string;
  outboundIp: string;
  proxyUrl: string;
};
export type ToRoomResponseInput = {
  room: RoomInstance;
  program: RoomProgram;
  version: RoomProgramVersion;
  proxyEndpoint: RoomProxyEndpoint | null;
};

export function toRoomResponse(input: ToRoomResponseInput): RoomResponse {
  const { room, program, version, proxyEndpoint } = input;

  return {
    id: room.uuid,
    program: {
      id: program.uuid,
      name: program.name,
      title: program.title
    } satisfies RoomResponseProgramSummary,
    version: {
      id: version.uuid,
      version: version.version
    } satisfies RoomResponseVersionSummary,
    state: room.state,
    roomLink: room.roomLink,
    launchConfig: room.launchConfig,
    public: room.public,
    proxyEndpoint: proxyEndpoint
      ? ({
          id: proxyEndpoint.uuid,
          key: proxyEndpoint.key,
          displayName: proxyEndpoint.displayName,
          outboundIp: proxyEndpoint.outboundIp,
          proxyUrl: proxyEndpoint.proxyUrl
        } satisfies RoomResponseProxyEndpointSummary)
      : null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    closedAt: room.closedAt
  };
}

export type RoomProgramRow = RoomProgram;
export type RoomProgramReleaseSourceInput = RoomProgramReleaseSource;
export type RoomVersionArtifactInput = RoomProgramVersionArtifact;
export type LaunchConfigInput = RoomLaunchConfig;
