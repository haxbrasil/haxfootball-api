import { Elysia, t } from "elysia";
import {
  confirm,
  confirmBodySchema,
  confirmResponseSchema
} from "@/features/accounts/confirm";
import {
  createAccount,
  createAccountBodySchema
} from "@/features/accounts/create-account";
import { getAccount } from "@/features/accounts/get-account";
import {
  listAccounts,
  listAccountsResponseSchema
} from "@/features/accounts/list-accounts";
import {
  accountResponseSchema,
  accountUuidParamsSchema
} from "@/features/accounts/account.contract";
import {
  updateAccount,
  updateAccountBodySchema
} from "@/features/accounts/update-account";
import { roleResponseSchema } from "@/features/roles/role.contract";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export const accountRoutes = new Elysia({
  name: "account-routes",
  prefix: "/accounts"
})
  .model({
    Role: roleResponseSchema,
    Account: accountResponseSchema,
    ConfirmAccountBody: confirmBodySchema,
    ConfirmAccountResponse: confirmResponseSchema,
    CreateAccountBody: createAccountBodySchema,
    ListAccounts: listAccountsResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    UpdateAccountBody: updateAccountBodySchema
  })
  .get("", ({ query }) => listAccounts(query), {
    query: paginationQuerySchema,
    response: {
      200: t.Ref("ListAccounts")
    },
    detail: {
      tags: ["Accounts"],
      summary: "List accounts"
    }
  })
  .get("/:uuid", ({ params }) => getAccount(params.uuid), {
    params: accountUuidParamsSchema,
    response: {
      200: t.Ref("Account"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Accounts"],
      summary: "Get an account"
    }
  })
  .post("/confirm", ({ body }) => confirm(body), {
    body: t.Ref("ConfirmAccountBody"),
    response: {
      200: t.Ref("ConfirmAccountResponse")
    },
    detail: {
      tags: ["Accounts"],
      summary: "Confirm an account"
    }
  })
  .post(
    "",
    ({ body, set }) => {
      set.status = 201;

      return createAccount(body);
    },
    {
      body: t.Ref("CreateAccountBody"),
      response: {
        201: t.Ref("Account")
      },
      detail: {
        tags: ["Accounts"],
        summary: "Create an account"
      }
    }
  )
  .patch("/:uuid", ({ body, params }) => updateAccount(params.uuid, body), {
    body: t.Ref("UpdateAccountBody"),
    params: accountUuidParamsSchema,
    response: {
      200: t.Ref("Account"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Accounts"],
      summary: "Update an account"
    }
  });
