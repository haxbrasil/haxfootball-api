import { Elysia } from "elysia";
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
import {
  roleResponseSchema,
  roleUuidParamsSchema
} from "@/features/roles/role.contract";
import { notFoundErrorResponseSchema } from "@/shared/http/errors";

export const roleRoutes = new Elysia({
  name: "role-routes",
  prefix: "/roles"
})
  .get("", () => listRoles(), {
    response: {
      200: listRolesResponseSchema
    },
    detail: {
      tags: ["Roles"],
      summary: "List roles"
    }
  })
  .get("/:uuid", ({ params }) => getRole(params.uuid), {
    params: roleUuidParamsSchema,
    response: {
      200: roleResponseSchema,
      404: notFoundErrorResponseSchema
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
      body: createRoleBodySchema,
      response: {
        201: roleResponseSchema
      },
      detail: {
        tags: ["Roles"],
        summary: "Create a role"
      }
    }
  )
  .delete("/:uuid", ({ params }) => removeRole(params.uuid), {
    params: roleUuidParamsSchema,
    response: {
      200: removeRoleResponseSchema,
      404: notFoundErrorResponseSchema
    },
    detail: {
      tags: ["Roles"],
      summary: "Remove a role"
    }
  });
