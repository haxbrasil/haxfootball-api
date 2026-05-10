import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { authRoutes } from "@/features/auth/auth.routes";
import { accountRoutes } from "@/features/accounts/account.routes";
import { playerRoutes } from "@/features/players/player.routes";
import { recordingRoutes } from "@/features/recordings/recording.routes";
import { roleRoutes } from "@/features/roles/role.routes";
import { withJwtGuard } from "@/guards/jwt.guard";
import { withCommonErrorResponses } from "@/plugins/common-error-responses";
import { errorHandler } from "@/plugins/error-handler";

export const app = new Elysia()
    .use(errorHandler())
    .use(
      swagger({
        path: "/docs",
        documentation: {
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
        }
      })
    )
    .get(
      "/health",
      () => ({ status: "ok" }),
      {
        detail: {
          tags: ["System"],
          security: []
        }
      }
    )
    .use(withCommonErrorResponses)
    .use(authRoutes)
    .group("/api", (api) =>
      api
        .use(withJwtGuard)
        .use(accountRoutes)
        .use(roleRoutes)
        .use(playerRoutes)
        .use(recordingRoutes)
    );
