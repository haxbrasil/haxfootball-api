import { Elysia, t } from "elysia";
import {
  bulkUpsertValues,
  bulkUpsertValuesBodySchema,
  valueResponseSchema
} from "@/features/localization/bulk-upsert-values";
import { getValue } from "@/features/localization/get-value";
import {
  listLanguages,
  listLanguagesResponseSchema
} from "@/features/localization/list-languages";
import { valueParamsSchema } from "@/features/localization/_shared/http/inputs";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export const localizationRoutes = new Elysia({
  name: "localization-routes"
})
  .model({
    BulkUpsertValuesBody: bulkUpsertValuesBodySchema,
    ListLanguages: listLanguagesResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    Value: valueResponseSchema
  })
  .get("/languages", ({ query }) => listLanguages(query), {
    query: paginationQuerySchema,
    response: {
      200: t.Ref("ListLanguages")
    },
    detail: {
      tags: ["Localization"],
      summary: "List languages"
    }
  })
  .post("/values/bulk", ({ body }) => bulkUpsertValues(body), {
    body: t.Ref("BulkUpsertValuesBody"),
    response: {
      200: t.Array(t.Ref("Value"))
    },
    detail: {
      tags: ["Localization"],
      summary: "Bulk upsert localized values"
    }
  })
  .get("/values/:value", ({ params }) => getValue(params.value), {
    params: valueParamsSchema,
    response: {
      200: t.Ref("Value"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Localization"],
      summary: "Get a localized value"
    }
  });
