import { t } from "elysia";
import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH
} from "@/features/accounts/password-policy";

export const accountNameSchema = t.String({
  minLength: 1,
  maxLength: 25,
  pattern: ".*[A-Za-z0-9].*"
});

export const accountPasswordSchema = t.String({
  minLength: ACCOUNT_PASSWORD_MIN_LENGTH,
  maxLength: ACCOUNT_PASSWORD_MAX_LENGTH
});

export const accountExternalIdSchema = t.String({
  pattern: "^[0-9]{17,20}$"
});

export const accountUuidParamsSchema = t.Object({
  uuid: t.String({ format: "uuid" })
});
