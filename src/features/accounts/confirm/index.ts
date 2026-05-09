import { password } from "bun";
import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import {
  accountNameSchema,
  accountPasswordSchema
} from "@/features/accounts/account.contract";
import { accounts } from "@/features/accounts/account.db";

export const confirmBodySchema = t.Object({
  name: accountNameSchema,
  password: accountPasswordSchema
});

export const confirmResponseSchema = t.Object({
  valid: t.Boolean()
});

export type ConfirmInput = Static<typeof confirmBodySchema>;
export type ConfirmResult = Static<typeof confirmResponseSchema>;

export async function confirm(input: ConfirmInput): Promise<ConfirmResult> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.name, input.name));

  if (!account) {
    return { valid: false };
  }

  return {
    valid: await password.verify(input.password, account.passwordHash)
  };
}
