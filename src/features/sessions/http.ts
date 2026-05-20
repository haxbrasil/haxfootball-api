import { Elysia, t } from "elysia";
import {
  confirmSessionBodySchema,
  sessionAccountSchema,
  sessionIdentityBodySchema
} from "@/features/sessions/_shared/http/inputs";
import {
  confirmSessionResponseSchema,
  resolveSessionResponseSchema
} from "@/features/sessions/_shared/http/responses";
import {
  confirmSession,
  resolveSession
} from "@/features/sessions/_shared/domain/session-resolution";

export const sessionRoutes = new Elysia({
  name: "session-routes",
  prefix: "/sessions"
})
  .model({
    ConfirmSessionBody: confirmSessionBodySchema,
    ConfirmSessionResponse: confirmSessionResponseSchema,
    ResolveSessionBody: sessionIdentityBodySchema,
    ResolveSessionResponse: resolveSessionResponseSchema,
    SessionAccount: sessionAccountSchema
  })
  .post("/resolve", ({ body }) => resolveSession(body), {
    body: t.Ref("ResolveSessionBody"),
    response: {
      200: t.Ref("ResolveSessionResponse")
    },
    detail: {
      tags: ["Sessions"],
      summary: "Resolve room player session"
    }
  })
  .post("/confirm", ({ body }) => confirmSession(body), {
    body: t.Ref("ConfirmSessionBody"),
    response: {
      200: t.Ref("ConfirmSessionResponse")
    },
    detail: {
      tags: ["Sessions"],
      summary: "Confirm room player session"
    }
  });
