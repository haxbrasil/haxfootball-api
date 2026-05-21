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
import { getAccountByExternalId } from "@/features/accounts/get-account-by-external-id";
import { getAccountByName } from "@/features/accounts/get-account-by-name";
import {
  listAccounts,
  listAccountsResponseSchema
} from "@/features/accounts/list-accounts";
import {
  accountExternalIdSchema,
  accountNameSchema,
  accountUuidParamsSchema
} from "@/features/accounts/_shared/http/inputs";
import { accountResponseSchema } from "@/features/accounts/_shared/http/responses";
import {
  updateAccount,
  updateAccountBodySchema
} from "@/features/accounts/update-account";
import { roleResponseSchema } from "@/features/roles/http";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";

const listAccountsQuerySchema = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  search: t.Optional(t.String({ minLength: 1, maxLength: 25 })),
  name: t.Optional(accountNameSchema),
  externalId: t.Optional(accountExternalIdSchema),
  roleUuid: t.Optional(t.String({ format: "uuid" }))
});

const accountNameParamsSchema = t.Object({
  name: accountNameSchema
});

const accountExternalIdParamsSchema = t.Object({
  externalId: accountExternalIdSchema
});

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
    query: listAccountsQuerySchema,
    response: {
      200: t.Ref("ListAccounts")
    },
    detail: {
      tags: ["Accounts"],
      summary: "List accounts"
    }
  })
  .get("/by-name/:name", ({ params }) => getAccountByName(params.name), {
    params: accountNameParamsSchema,
    response: {
      200: t.Ref("Account"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Accounts"],
      summary: "Get an account by name"
    }
  })
  .get(
    "/by-external-id/:externalId",
    ({ params }) => getAccountByExternalId(params.externalId),
    {
      params: accountExternalIdParamsSchema,
      response: {
        200: t.Ref("Account"),
        404: t.Ref("NotFoundError")
      },
      detail: {
        tags: ["Accounts"],
        summary: "Get an account by external ID"
      }
    }
  )
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
