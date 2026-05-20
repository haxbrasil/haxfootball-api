import {
  openapi,
  toOpenAPISchema,
  type ElysiaOpenAPIConfig
} from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { normalizeOpenApiDocument } from "@lib/openapi";
import { authRoutes } from "@/features/auth/http";
import { accountRoutes } from "@/features/accounts/http";
import { jobRoutes } from "@/features/jobs/http";
import { localizationRoutes } from "@/features/localization/http";
import { matchRoutes } from "@/features/matches/http";
import { permissionRoutes } from "@/features/permissions/http";
import { playerRoutes } from "@/features/players/http";
import { recordingRoutes } from "@/features/recordings/http";
import { roleRoutes } from "@/features/roles/http";
import { publicRoomArtifactRoutes, roomRoutes } from "@/features/rooms/http";
import { sessionRoutes } from "@/features/sessions/http";
import { statEventSchemaRoutes } from "@/features/stat-event-schemas/http";
import { withJwtGuard } from "@/guards/jwt.guard";
import { withCommonErrorResponses } from "@/plugins/common-error-responses";
import { errorHandler } from "@/plugins/error-handler";

const openApiDocumentation = {
  info: {
    title: "HaxFootball API",
    version: "0.1.0"
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  },
  security: [{ bearerAuth: [] }]
} satisfies NonNullable<ElysiaOpenAPIConfig["documentation"]>;

export const app = new Elysia();

app
  .use(errorHandler())
  .use(
    openapi({
      path: "/docs",
      documentation: openApiDocumentation
    })
  )
  .get("/docs/json", () => normalizedOpenApiDocument(), {
    detail: {
      hide: true
    }
  })
  .get("/health", () => ({ status: "ok" }), {
    detail: {
      tags: ["System"],
      security: []
    }
  })
  .use(withCommonErrorResponses)
  .use(publicRoomArtifactRoutes)
  .use(authRoutes)
  .group("/api", (api) =>
    api
      .use(withJwtGuard)
      .use(accountRoutes)
      .use(permissionRoutes)
      .use(roleRoutes)
      .use(playerRoutes)
      .use(sessionRoutes)
      .use(jobRoutes)
      .use(localizationRoutes)
      .use(matchRoutes)
      .use(recordingRoutes)
      .use(roomRoutes)
      .use(statEventSchemaRoutes)
  );

function normalizedOpenApiDocument(): unknown {
  const schema = toOpenAPISchema(app);

  return normalizeOpenApiDocument({
    openapi: "3.0.3",
    info: {
      description: "Development documentation",
      ...openApiDocumentation.info
    },
    paths: schema.paths,
    components: {
      ...openApiDocumentation.components,
      schemas: schema.components.schemas
    },
    security: openApiDocumentation.security
  });
}
