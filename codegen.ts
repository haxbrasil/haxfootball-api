import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "src/features/live-state/_graphql/schema.graphql",
  generates: {
    "src/features/live-state/_graphql/generated.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        contextType: "./context#LiveStateGraphqlContext",
        defaultMapper: "Partial<{T}>",
        mapperTypeSuffix: "Model",
        scalars: {
          DateTime: {
            input: "string",
            output: "string"
          },
          JSON: {
            input: "@lib#JsonValue",
            output: "@lib#JsonValue"
          }
        },
        mappers: {
          LiveRoom:
            "@/features/live-state/_shared/domain/protocol#LiveRoomState",
          LiveNativeRoom:
            "@/features/live-state/_shared/domain/protocol#LiveNativeRoom",
          LiveNativeScore:
            "@/features/live-state/_shared/domain/protocol#LiveNativeScore",
          LivePlayer:
            "@/features/live-state/_shared/domain/protocol#LivePlayer",
          LiveStateDocument:
            "@/features/live-state/_shared/domain/protocol#LiveStateDocument",
          LiveStateFact:
            "@/features/live-state/_shared/domain/protocol#LiveStateFact",
          LiveRoomCommand:
            "@/features/live-state/_shared/db/commands#LiveRoomCommandResponse"
        }
      }
    }
  }
};

export default config;
