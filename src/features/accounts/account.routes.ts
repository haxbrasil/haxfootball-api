import { Elysia } from "elysia";
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
import { notFoundErrorResponseSchema } from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export const accountRoutes = new Elysia({
  name: "account-routes",
  prefix: "/accounts"
})
  .get("", ({ query }) => listAccounts(query), {
    query: paginationQuerySchema,
    response: {
      200: listAccountsResponseSchema
    },
    detail: {
      tags: ["Accounts"],
      summary: "List accounts"
    }
  })
  .get("/:uuid", ({ params }) => getAccount(params.uuid), {
    params: accountUuidParamsSchema,
    response: {
      200: accountResponseSchema,
      404: notFoundErrorResponseSchema
    },
    detail: {
      tags: ["Accounts"],
      summary: "Get an account"
    }
  })
  .post("/confirm", ({ body }) => confirm(body), {
    body: confirmBodySchema,
    response: {
      200: confirmResponseSchema
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
  .patch("/:uuid", ({ body, params }) => updateAccount(params.uuid, body), {
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
  });
