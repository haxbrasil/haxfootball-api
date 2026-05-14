import {
  openapi,
  toOpenAPISchema,
  type ElysiaOpenAPIConfig
} from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { normalizeOpenApiDocument } from "@lib/openapi";
import { authRoutes } from "@/features/auth/auth.routes";
import { accountRoutes } from "@/features/accounts/account.routes";
import { matchRoutes } from "@/features/matches/match.routes";
import { permissionRoutes } from "@/features/permissions/permission.routes";
import { playerRoutes } from "@/features/players/player.routes";
import { recordingRoutes } from "@/features/recordings/recording.routes";
import { roleRoutes } from "@/features/roles/role.routes";
import { reconcileOpenRooms } from "@/features/rooms/reconcile-rooms";
import { roomRoutes } from "@/features/rooms/room.routes";
import { statEventSchemaRoutes } from "@/features/stat-event-schemas/stat-event-schema.routes";
import { withJwtGuard } from "@/guards/jwt.guard";
import { withCommonErrorResponses } from "@/plugins/common-error-responses";
import { errorHandler } from "@/plugins/error-handler";

const openApiDocumentation = {
  info: {
    title: "Backend API",
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
  .onStart(() => {
    void reconcileOpenRooms();
  })
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
  .use(authRoutes)
  .group("/api", (api) =>
    api
      .use(withJwtGuard)
      .use(accountRoutes)
      .use(permissionRoutes)
      .use(roleRoutes)
      .use(playerRoutes)
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
