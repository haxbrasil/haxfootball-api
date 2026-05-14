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
  r2UploadUrl: Type.Optional(Type.String({ minLength: 1 })),
  r2UploadToken: Type.Optional(Type.String({ minLength: 1 })),
  recordingMaxBytes: Type.Integer({
    default: 25 * 1024 * 1024,
    minimum: 1
  }),
  roomGithubApiBaseUrl: Type.String({
    default: "https://api.github.com",
    minLength: 1
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
  r2UploadUrl: Bun.env.R2_UPLOAD_URL,
  r2UploadToken: Bun.env.R2_UPLOAD_TOKEN,
  recordingMaxBytes: Bun.env.RECORDING_MAX_BYTES,
  roomGithubApiBaseUrl: Bun.env.ROOM_GITHUB_API_BASE_URL,
  roomProcessRunner: Bun.env.ROOM_PROCESS_RUNNER,
  roomNodeBinary: Bun.env.ROOM_NODE_BINARY,
  roomPackageCacheDir: Bun.env.ROOM_PACKAGE_CACHE_DIR,
  roomProcessLogDir: Bun.env.ROOM_PROCESS_LOG_DIR
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
