import { type Static, t } from "elysia";

export const sessionIdentityBodySchema = t.Object({
  roomId: t.String({ minLength: 1, maxLength: 64 }),
  roomPlayerId: t.Integer({ minimum: 0 }),
  name: t.String({
    minLength: 1,
    maxLength: 25
  }),
  auth: t.Nullable(t.String({ minLength: 1, maxLength: 256 })),
  conn: t.Nullable(t.String({ minLength: 1, maxLength: 256 }))
});

export const confirmSessionBodySchema = t.Intersect([
  sessionIdentityBodySchema,
  t.Object({
    password: t.String({ minLength: 4, maxLength: 19 })
  })
]);

export const sessionAccountSchema = t.Object({
  uuid: t.String({ format: "uuid" }),
  name: t.String(),
  externalId: t.String()
});

export type SessionIdentityInput = Static<typeof sessionIdentityBodySchema>;
export type ConfirmSessionInput = Static<typeof confirmSessionBodySchema>;
export type SessionAccount = Static<typeof sessionAccountSchema>;
