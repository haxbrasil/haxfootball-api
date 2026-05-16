import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import { Value } from "@sinclair/typebox/value";

const envSchema = Type.Object({
  port: Type.Integer({ default: 3000, minimum: 1, maximum: 65535 }),
  host: Type.String({ default: "0.0.0.0", minLength: 1 }),
  appApiKey: Type.String({ minLength: 1 }),
  jwtSecret: Type.String({ minLength: 1 }),
  databaseFile: Type.String({ default: "data/app.sqlite", minLength: 1 }),
  r2Bucket: Type.String({ default: "recs", minLength: 1 }),
  r2PublicBaseUrl: Type.String({
    default: "https://recs.haxbrasil.com",
    minLength: 1
  }),
  r2Endpoint: Type.String({ minLength: 1 }),
  r2AccessKeyId: Type.String({ minLength: 1 }),
  r2SecretAccessKey: Type.String({ minLength: 1 }),
  recordingMaxBytes: Type.Integer({
    default: 25 * 1024 * 1024,
    minimum: 1
  }),
  roomGithubApiBaseUrl: Type.String({
    default: "https://api.github.com",
    minLength: 1
  }),
  publicBaseUrl: Type.String({
    default: "http://localhost:3000",
    minLength: 1
  }),
  roomArtifactStorageDir: Type.String({
    default: "/tmp/haxfootball-api-room-artifacts",
    minLength: 1
  }),
  roomPublicPolicy: Type.Union(
    [Type.Literal("default"), Type.Literal("force-private")],
    {
      default: "default"
    }
  ),
  roomStaleCloseAfterSeconds: Type.Integer({
    default: 0,
    minimum: 0
  }),
  roomProvisioningTimeoutSeconds: Type.Integer({
    default: 120,
    minimum: 1
  }),
  roomProcessRunner: Type.Union(
    [Type.Literal("bubblewrap"), Type.Literal("node")],
    {
      default: "bubblewrap"
    }
  ),
  roomNodeBinary: Type.String({ default: "node", minLength: 1 }),
  roomPackageCacheDir: Type.String({
    default: "/tmp/haxfootball-api-room-packages",
    minLength: 1
  }),
  roomProcessLogDir: Type.String({
    default: "/tmp/haxfootball-api-rooms",
    minLength: 1
  }),
  jobRunnerEnabled: Type.Boolean({ default: true }),
  jobRunnerId: Type.Optional(Type.String({ minLength: 1 })),
  jobPollIntervalSeconds: Type.Integer({
    default: 5,
    minimum: 1
  }),
  jobLockTimeoutSeconds: Type.Integer({
    default: 300,
    minimum: 1
  }),
  roomReconcileIntervalSeconds: Type.Integer({
    default: 30,
    minimum: 0
  })
});

type Env = Static<typeof envSchema>;

const envInput = {
  port: Bun.env.PORT,
  host: Bun.env.HOST,
  appApiKey: Bun.env.APP_API_KEY,
  jwtSecret: Bun.env.JWT_SECRET,
  databaseFile: Bun.env.DATABASE_FILE,
  r2Bucket: Bun.env.R2_BUCKET,
  r2PublicBaseUrl: Bun.env.R2_PUBLIC_BASE_URL,
  r2Endpoint: Bun.env.R2_ENDPOINT,
  r2AccessKeyId: Bun.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
  recordingMaxBytes: Bun.env.RECORDING_MAX_BYTES,
  roomGithubApiBaseUrl: Bun.env.ROOM_GITHUB_API_BASE_URL,
  publicBaseUrl: Bun.env.PUBLIC_BASE_URL,
  roomArtifactStorageDir: Bun.env.ROOM_ARTIFACT_STORAGE_DIR,
  roomPublicPolicy: Bun.env.ROOM_PUBLIC_POLICY,
  roomStaleCloseAfterSeconds: Bun.env.ROOM_STALE_CLOSE_AFTER_SECONDS,
  roomProvisioningTimeoutSeconds: Bun.env.ROOM_PROVISIONING_TIMEOUT_SECONDS,
  roomProcessRunner: Bun.env.ROOM_PROCESS_RUNNER,
  roomNodeBinary: Bun.env.ROOM_NODE_BINARY,
  roomPackageCacheDir: Bun.env.ROOM_PACKAGE_CACHE_DIR,
  roomProcessLogDir: Bun.env.ROOM_PROCESS_LOG_DIR,
  jobRunnerEnabled: Bun.env.JOB_RUNNER_ENABLED,
  jobRunnerId: Bun.env.JOB_RUNNER_ID,
  jobPollIntervalSeconds: Bun.env.JOB_POLL_INTERVAL_SECONDS,
  jobLockTimeoutSeconds: Bun.env.JOB_LOCK_TIMEOUT_SECONDS,
  roomReconcileIntervalSeconds: Bun.env.ROOM_RECONCILE_INTERVAL_SECONDS
};

const envValidator = TypeCompiler.Compile(envSchema);
const envCandidate = Value.Convert(
  envSchema,
  Value.Default(envSchema, envInput)
);

if (!envValidator.Check(envCandidate)) {
  const errors = [...envValidator.Errors(envCandidate)]
    .map((error) => `${error.path || "/"}: ${error.message}`)
    .join("; ");

  throw new Error(`Invalid environment: ${errors}`);
}

export const env: Env = envValidator.Decode(envCandidate);
