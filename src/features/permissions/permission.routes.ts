import { Elysia, t } from "elysia";
import {
  createPermission,
  createPermissionBodySchema
} from "@/features/permissions/create-permission";
import { getPermission } from "@/features/permissions/get-permission";
import {
  listPermissions,
  listPermissionsResponseSchema
} from "@/features/permissions/list-permissions";
import {
  removePermission,
  removePermissionResponseSchema
} from "@/features/permissions/remove-permission";
import {
  permissionResponseSchema,
  permissionUuidParamsSchema
} from "@/features/permissions/permission.contract";
import {
  updatePermission,
  updatePermissionBodySchema
} from "@/features/permissions/update-permission";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export const permissionRoutes = new Elysia({
  name: "permission-routes",
  prefix: "/permissions"
})
  .model({
    CreatePermissionBody: createPermissionBodySchema,
    ListPermissions: listPermissionsResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    Permission: permissionResponseSchema,
    RemovePermissionResponse: removePermissionResponseSchema,
    UpdatePermissionBody: updatePermissionBodySchema
  })
  .get("", ({ query }) => listPermissions(query), {
    query: paginationQuerySchema,
    response: {
      200: t.Ref("ListPermissions")
    },
    detail: {
      tags: ["Permissions"],
      summary: "List permissions"
    }
  })
  .get("/:uuid", ({ params }) => getPermission(params.uuid), {
    params: permissionUuidParamsSchema,
    response: {
      200: t.Ref("Permission"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Permissions"],
      summary: "Get a permission"
    }
  })
  .post(
    "",
    ({ body, set }) => {
      set.status = 201;

      return createPermission(body);
    },
    {
      body: t.Ref("CreatePermissionBody"),
      response: {
        201: t.Ref("Permission")
      },
      detail: {
        tags: ["Permissions"],
        summary: "Create a permission"
      }
    }
  )
  .patch("/:uuid", ({ body, params }) => updatePermission(params.uuid, body), {
    body: t.Ref("UpdatePermissionBody"),
    params: permissionUuidParamsSchema,
    response: {
      200: t.Ref("Permission"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Permissions"],
      summary: "Update a permission"
    }
  })
  .delete("/:uuid", ({ params }) => removePermission(params.uuid), {
    params: permissionUuidParamsSchema,
    response: {
      200: t.Ref("RemovePermissionResponse"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Permissions"],
      summary: "Remove a permission"
    }
  });
