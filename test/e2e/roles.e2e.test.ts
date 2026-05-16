import { describe, expect, it } from "bun:test";
import {
  paginatedBody,
  paginatedItems,
  request
} from "@/test/e2e/helpers/helpers";

type RoleResponse = {
  uuid: string;
  name: string;
  title: string;
  permissions: string[];
  bypassAllPermissions: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

describe("roles", () => {
  it("creates a role", async () => {
    const response = await request("/api/roles", {
      method: "POST",
      body: {
        name: "coach",
        title: "Coach",
        permissions: ["rooms:create", "admin:ban"]
      }
    });

    expect(response.status).toBe(201);

    const role = await response.json();

    expect(role).toMatchObject({
      uuid: expect.any(String),
      name: "coach",
      title: "Coach",
      permissions: ["rooms:create", "admin:ban"],
      bypassAllPermissions: false,
      isDefault: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
    expect(role.id).toBeUndefined();
  });

  it("expands wildcard role permissions dynamically", async () => {
    const firstPermissionResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "wildcard:initial-a",
        title: "Wildcard Initial A"
      }
    });
    const secondPermissionResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "wildcard:initial-b",
        title: "Wildcard Initial B"
      }
    });

    expect(firstPermissionResponse.status).toBe(201);
    expect(secondPermissionResponse.status).toBe(201);

    const createRoleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "wildcard-role",
        title: "Wildcard Role",
        permissions: ["*"]
      }
    });

    expect(createRoleResponse.status).toBe(201);

    const role: RoleResponse = await createRoleResponse.json();

    expect(role).toMatchObject({
      name: "wildcard-role",
      title: "Wildcard Role",
      bypassAllPermissions: true
    });
    expect(role.permissions).toEqual(
      expect.arrayContaining(["wildcard:initial-a", "wildcard:initial-b"])
    );
    expect(role.permissions).not.toContain("*");

    const laterPermissionResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "wildcard:later",
        title: "Wildcard Later"
      }
    });

    expect(laterPermissionResponse.status).toBe(201);

    const getRoleResponse = await request(`/api/roles/${role.uuid}`);

    expect(getRoleResponse.status).toBe(200);

    const refreshedRole: RoleResponse = await getRoleResponse.json();

    expect(refreshedRole.bypassAllPermissions).toBe(true);
    expect(refreshedRole.permissions).toEqual(
      expect.arrayContaining([
        "wildcard:initial-a",
        "wildcard:initial-b",
        "wildcard:later"
      ])
    );
    expect(refreshedRole.permissions).not.toContain("*");
  });

  it("updates and clears wildcard role permissions", async () => {
    const createRoleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "wildcard-update-role",
        title: "Wildcard Update Role",
        permissions: ["wildcard:update-explicit"]
      }
    });

    expect(createRoleResponse.status).toBe(201);

    const role: RoleResponse = await createRoleResponse.json();
    const wildcardResponse = await request(`/api/roles/${role.uuid}`, {
      method: "PATCH",
      body: {
        permissions: ["*"]
      }
    });

    expect(wildcardResponse.status).toBe(200);

    const wildcardRole: RoleResponse = await wildcardResponse.json();

    expect(wildcardRole.bypassAllPermissions).toBe(true);
    expect(wildcardRole.permissions).toContain("wildcard:update-explicit");
    expect(wildcardRole.permissions).not.toContain("*");

    const explicitResponse = await request(`/api/roles/${role.uuid}`, {
      method: "PATCH",
      body: {
        permissions: ["wildcard:update-explicit"]
      }
    });

    expect(explicitResponse.status).toBe(200);
    expect(await explicitResponse.json()).toMatchObject({
      bypassAllPermissions: false,
      permissions: ["wildcard:update-explicit"]
    });

    const clearResponse = await request(`/api/roles/${role.uuid}`, {
      method: "PATCH",
      body: {
        permissions: []
      }
    });

    expect(clearResponse.status).toBe(200);
    expect(await clearResponse.json()).toMatchObject({
      bypassAllPermissions: false,
      permissions: []
    });
  });

  it("lists roles", async () => {
    const createResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "manager",
        title: "Manager",
        permissions: ["rooms:moderate"]
      }
    });

    expect(createResponse.status).toBe(201);

    const role = await createResponse.json();
    const response = await request("/api/roles");

    expect(response.status).toBe(200);

    const roles = await paginatedItems<RoleResponse>(response);

    expect(roles).toContainEqual(role);
    expect(roles).toContainEqual(
      expect.objectContaining({
        name: "default",
        title: "Default",
        permissions: [],
        isDefault: true
      })
    );
  });

  it("paginates roles with cursors", async () => {
    const firstResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "cursor-role-a",
        title: "Cursor Role A"
      }
    });
    const secondResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "cursor-role-b",
        title: "Cursor Role B"
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const firstPageResponse = await request("/api/roles?limit=1");

    expect(firstPageResponse.status).toBe(200);

    const firstPage = await paginatedBody<RoleResponse>(firstPageResponse);

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.page.limit).toBe(1);
    expect(firstPage.page.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await request(
      `/api/roles?limit=1&cursor=${encodeURIComponent(
        firstPage.page.nextCursor ?? ""
      )}`
    );

    expect(secondPageResponse.status).toBe(200);

    const secondPage = await paginatedBody<RoleResponse>(secondPageResponse);

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.page.limit).toBe(1);
    expect(secondPage.items[0].uuid).not.toBe(firstPage.items[0].uuid);
  });

  it("gets a role by UUID", async () => {
    const createResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "analyst",
        title: "Analyst"
      }
    });

    expect(createResponse.status).toBe(201);

    const role = await createResponse.json();
    const response = await request(`/api/roles/${role.uuid}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(role);
  });

  it("updates a role", async () => {
    const createResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "editor",
        title: "Editor",
        permissions: ["matches:create"]
      }
    });

    expect(createResponse.status).toBe(201);

    const role: RoleResponse = await createResponse.json();
    const updateResponse = await request(`/api/roles/${role.uuid}`, {
      method: "PATCH",
      body: {
        title: "Match Editor",
        permissions: ["matches:create", "matches:update"]
      }
    });

    expect(updateResponse.status).toBe(200);

    const updated: RoleResponse = await updateResponse.json();

    expect(updated).toMatchObject({
      uuid: role.uuid,
      name: "editor",
      title: "Match Editor",
      permissions: ["matches:create", "matches:update"],
      isDefault: false
    });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(role.updatedAt).getTime()
    );

    const getResponse = await request(`/api/roles/${role.uuid}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(updated);

    const clearResponse = await request(`/api/roles/${role.uuid}`, {
      method: "PATCH",
      body: {
        permissions: []
      }
    });

    expect(clearResponse.status).toBe(200);
    expect(await clearResponse.json()).toMatchObject({
      uuid: role.uuid,
      permissions: []
    });
  });

  it("returns 404 when a role does not exist", async () => {
    const response = await request(
      "/api/roles/00000000-0000-4000-8000-000000000000"
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Role not found"
      }
    });
  });

  it("removes a role", async () => {
    const createResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "retired",
        title: "Retired"
      }
    });

    expect(createResponse.status).toBe(201);

    const role = await createResponse.json();
    const deleteResponse = await request(`/api/roles/${role.uuid}`, {
      method: "DELETE"
    });

    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ deleted: true });

    const getResponse = await request(`/api/roles/${role.uuid}`);

    expect(getResponse.status).toBe(404);
  });

  it("returns 404 when removing a missing role", async () => {
    const response = await request(
      "/api/roles/00000000-0000-4000-8000-000000000000",
      {
        method: "DELETE"
      }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Role not found"
      }
    });
  });

  it("moves assigned accounts to the default role when a role is removed", async () => {
    const roleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "temporary",
        title: "Temporary"
      }
    });

    expect(roleResponse.status).toBe(201);

    const role = await roleResponse.json();
    const createAccountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "PlayerRoleFallback",
        password: "pass1234",
        externalId: "823456789012345678"
      }
    });

    expect(createAccountResponse.status).toBe(201);

    const account = await createAccountResponse.json();
    const updateAccountResponse = await request(
      `/api/accounts/${account.uuid}`,
      {
        method: "PATCH",
        body: {
          roleUuid: role.uuid
        }
      }
    );

    expect(updateAccountResponse.status).toBe(200);
    expect(await updateAccountResponse.json()).toMatchObject({
      role
    });

    const deleteResponse = await request(`/api/roles/${role.uuid}`, {
      method: "DELETE"
    });

    expect(deleteResponse.status).toBe(200);

    const getAccountResponse = await request(`/api/accounts/${account.uuid}`);

    expect(getAccountResponse.status).toBe(200);
    expect(await getAccountResponse.json()).toMatchObject({
      uuid: account.uuid,
      role: {
        name: "default",
        title: "Default",
        permissions: [],
        isDefault: true
      }
    });
  });

  it("does not remove the default role", async () => {
    const listResponse = await request("/api/roles");

    expect(listResponse.status).toBe(200);

    const roles = await paginatedItems<RoleResponse>(listResponse);
    const defaultRole = roles.find((role) => role.isDefault);

    if (!defaultRole) {
      throw new Error("Expected default role to exist");
    }

    const deleteResponse = await request(`/api/roles/${defaultRole.uuid}`, {
      method: "DELETE"
    });

    expect(deleteResponse.status).toBe(400);
    expect(await deleteResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Default role cannot be removed"
      }
    });
  });

  it("does not update the default role name", async () => {
    const listResponse = await request("/api/roles");

    expect(listResponse.status).toBe(200);

    const roles = await paginatedItems<RoleResponse>(listResponse);
    const defaultRole = roles.find((role) => role.isDefault);

    if (!defaultRole) {
      throw new Error("Expected default role to exist");
    }

    const response = await request(`/api/roles/${defaultRole.uuid}`, {
      method: "PATCH",
      body: {
        name: "default-renamed"
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Default role name cannot be changed"
      }
    });
  });

  it("does not create another default role", async () => {
    const response = await request("/api/roles", {
      method: "POST",
      body: {
        name: "default",
        title: "Default"
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Role name already exists"
      }
    });
  });

  it("does not create duplicate non-default role names", async () => {
    const firstResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "duplicate-role",
        title: "Duplicate Role"
      }
    });

    expect(firstResponse.status).toBe(201);

    const secondResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "duplicate-role",
        title: "Duplicate Role Again"
      }
    });

    expect(secondResponse.status).toBe(400);
    expect(await secondResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Role name already exists"
      }
    });
  });

  it("rejects invalid role input and UUID params", async () => {
    const invalidBodyResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "Invalid Role",
        title: "",
        permissions: ["Invalid Permission"]
      }
    });
    const invalidGetResponse = await request("/api/roles/not-a-uuid");
    const invalidPatchResponse = await request("/api/roles/not-a-uuid", {
      method: "PATCH",
      body: {
        permissions: ["rooms:create"]
      }
    });
    const invalidDeleteResponse = await request("/api/roles/not-a-uuid", {
      method: "DELETE"
    });

    expect(invalidBodyResponse.status).toBe(400);
    expect(invalidGetResponse.status).toBe(400);
    expect(invalidPatchResponse.status).toBe(400);
    expect(invalidDeleteResponse.status).toBe(400);
    expect(await invalidBodyResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
    expect(await invalidGetResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
    expect(await invalidPatchResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
    expect(await invalidDeleteResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
  });

  it("rejects duplicate role permissions", async () => {
    const response = await request("/api/roles", {
      method: "POST",
      body: {
        name: "duplicate-permissions",
        title: "Duplicate Permissions",
        permissions: ["rooms:create", "rooms:create"]
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
  });
});
