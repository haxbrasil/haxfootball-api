import { Elysia, t } from "elysia";
import { createRole, createRoleBodySchema } from "@/features/roles/create-role";
import { getRole } from "@/features/roles/get-role";
import {
  listRoles,
  listRolesResponseSchema
} from "@/features/roles/list-roles";
import {
  removeRole,
  removeRoleResponseSchema
} from "@/features/roles/remove-role";
import { roleUuidParamsSchema } from "@/features/roles/_shared/http/inputs";
import { roleResponseSchema } from "@/features/roles/_shared/http/responses";
import { updateRole, updateRoleBodySchema } from "@/features/roles/update-role";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";
import { paginationQuerySchema } from "@lib";

export {
  allPermissionsWildcard,
  roleNameSchema,
  rolePermissionInputKeySchema,
  rolePermissionInputSchema,
  rolePermissionsSchema,
  roleTitleSchema,
  roleUuidParamsSchema
} from "@/features/roles/_shared/http/inputs";
export {
  roleResponseSchema,
  toRoleResponse
} from "@/features/roles/_shared/http/responses";
export type {
  RoleResponse,
  RoleWithPermissions
} from "@/features/roles/_shared/http/responses";

export const roleRoutes = new Elysia({
  name: "role-routes",
  prefix: "/roles"
})
  .model({
    CreateRoleBody: createRoleBodySchema,
    ListRoles: listRolesResponseSchema,
    NotFoundError: notFoundErrorResponseSchema,
    RemoveRoleResponse: removeRoleResponseSchema,
    Role: roleResponseSchema,
    UpdateRoleBody: updateRoleBodySchema
  })
  .get("", ({ query }) => listRoles(query), {
    query: paginationQuerySchema,
    response: {
      200: t.Ref("ListRoles")
    },
    detail: {
      tags: ["Roles"],
      summary: "List roles"
    }
  })
  .get("/:uuid", ({ params }) => getRole(params.uuid), {
    params: roleUuidParamsSchema,
    response: {
      200: t.Ref("Role"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Roles"],
      summary: "Get a role"
    }
  })
  .post(
    "",
    ({ body, set }) => {
      set.status = 201;

      return createRole(body);
    },
    {
      body: t.Ref("CreateRoleBody"),
      response: {
        201: t.Ref("Role")
      },
      detail: {
        tags: ["Roles"],
        summary: "Create a role"
      }
    }
  )
  .patch("/:uuid", ({ body, params }) => updateRole(params.uuid, body), {
    body: t.Ref("UpdateRoleBody"),
    params: roleUuidParamsSchema,
    response: {
      200: t.Ref("Role"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Roles"],
      summary: "Update a role"
    }
  })
  .delete("/:uuid", ({ params }) => removeRole(params.uuid), {
    params: roleUuidParamsSchema,
    response: {
      200: t.Ref("RemoveRoleResponse"),
      404: t.Ref("NotFoundError")
    },
    detail: {
      tags: ["Roles"],
      summary: "Remove a role"
    }
  });
