import { Elysia } from "elysia";
import {
  confirm,
  confirmBodySchema,
  confirmResponseSchema
} from "./confirm";
import { createAccount, createAccountBodySchema } from "./create-account";
import { getAccount } from "./get-account";
import { listAccounts, listAccountsResponseSchema } from "./list-accounts";
import {
  accountResponseSchema,
  accountUuidParamsSchema
} from "./account.contract";
import { updateAccount, updateAccountBodySchema } from "./update-account";
import { notFoundErrorResponseSchema } from "../../shared/http/errors";

export const accountRoutes = new Elysia({
  name: "account-routes",
  prefix: "/accounts"
})
  .get(
    "",
    () => listAccounts(),
    {
      response: {
        200: listAccountsResponseSchema
      },
      detail: {
        tags: ["Accounts"],
        summary: "List accounts"
      }
    }
  )
  .get(
    "/:uuid",
    ({ params }) => getAccount(params.uuid),
    {
      params: accountUuidParamsSchema,
      response: {
        200: accountResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Accounts"],
        summary: "Get an account"
      }
    }
  )
  .post(
    "/confirm",
    ({ body }) => confirm(body),
    {
      body: confirmBodySchema,
      response: {
        200: confirmResponseSchema
      },
      detail: {
        tags: ["Accounts"],
        summary: "Confirm an account"
      }
    }
  )
  .post(
    "",
    ({ body, set }) => {
      set.status = 201;

      return createAccount(body);
    },
    {
      body: createAccountBodySchema,
      response: {
        201: accountResponseSchema
      },
      detail: {
        tags: ["Accounts"],
        summary: "Create an account"
      }
    }
  )
  .patch(
    "/:uuid",
    ({ body, params }) => updateAccount(params.uuid, body),
    {
      body: updateAccountBodySchema,
      params: accountUuidParamsSchema,
      response: {
        200: accountResponseSchema,
        404: notFoundErrorResponseSchema
      },
      detail: {
        tags: ["Accounts"],
        summary: "Update an account"
      }
    }
  );
