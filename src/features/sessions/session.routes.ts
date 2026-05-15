import { Elysia, t } from "elysia";
import {
  confirmSessionBodySchema,
  confirmSessionResponseSchema,
  resolveSessionResponseSchema,
  sessionAccountSchema,
  sessionIdentityBodySchema
} from "@/features/sessions/session.contract";
import {
  confirmSession,
  resolveSession
} from "@/features/sessions/session.service";

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
