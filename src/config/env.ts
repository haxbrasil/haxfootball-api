import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import { Value } from "@sinclair/typebox/value";

const envSchema = Type.Object({
  port: Type.Integer({ default: 3000, minimum: 1, maximum: 65535 }),
  host: Type.String({ default: "0.0.0.0", minLength: 1 }),
  appApiKey: Type.String({ minLength: 1 }),
  jwtSecret: Type.String({ minLength: 1 }),
  databaseFile: Type.String({ default: "data/app.sqlite", minLength: 1 })
});

type Env = Static<typeof envSchema>;

const envInput = {
  port: Bun.env.PORT,
  host: Bun.env.HOST,
  appApiKey: Bun.env.APP_API_KEY,
  jwtSecret: Bun.env.JWT_SECRET,
  databaseFile: Bun.env.DATABASE_FILE
};

const envValidator = TypeCompiler.Compile(envSchema);
const envCandidate = Value.Convert(envSchema, Value.Default(envSchema, envInput));

if (!envValidator.Check(envCandidate)) {
  const errors = [...envValidator.Errors(envCandidate)]
    .map((error) => `${error.path || "/"}: ${error.message}`)
    .join("; ");

  throw new Error(`Invalid environment: ${errors}`);
}

export const env: Env = envValidator.Decode(envCandidate);
