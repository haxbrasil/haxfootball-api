import { describe, expect, it } from "bun:test";
import {
  paginatedBody,
  paginatedItems,
  request
} from "@/test/e2e/helpers/helpers";

type PermissionResponse = {
  uuid: string;
  key: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

describe("permissions", () => {
  it("creates a permission", async () => {
    const response = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "permissions:create",
        title: "Create permissions"
      }
    });

    expect(response.status).toBe(201);

    const permission = await response.json();

    expect(permission).toMatchObject({
      uuid: expect.any(String),
      key: "permissions:create",
      title: "Create permissions",
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
    expect(permission.id).toBeUndefined();
  });

  it("lists permissions with cursors", async () => {
    const firstResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "permissions:list-a",
        title: "List permission A"
      }
    });
    const secondResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "permissions:list-b",
        title: "List permission B"
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const firstPageResponse = await request("/api/permissions?limit=1");

    expect(firstPageResponse.status).toBe(200);

    const firstPage =
      await paginatedBody<PermissionResponse>(firstPageResponse);

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.page.limit).toBe(1);
    expect(firstPage.page.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await request(
      `/api/permissions?limit=1&cursor=${encodeURIComponent(
        firstPage.page.nextCursor ?? ""
      )}`
    );

    expect(secondPageResponse.status).toBe(200);

    const secondPage =
      await paginatedBody<PermissionResponse>(secondPageResponse);

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0].uuid).not.toBe(firstPage.items[0].uuid);
  });

  it("gets and updates a permission", async () => {
    const createResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "permissions:update-source",
        title: "Update source"
      }
    });

    expect(createResponse.status).toBe(201);

    const permission: PermissionResponse = await createResponse.json();
    const getResponse = await request(`/api/permissions/${permission.uuid}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(permission);

    const roleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "permission-key-update",
        title: "Permission Key Update",
        permissions: ["permissions:update-source"]
      }
    });

    expect(roleResponse.status).toBe(201);

    const role = await roleResponse.json();
    const updateResponse = await request(
      `/api/permissions/${permission.uuid}`,
      {
        method: "PATCH",
        body: {
          key: "permissions:update-target",
          title: "Update target"
        }
      }
    );

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({
      uuid: permission.uuid,
      key: "permissions:update-target",
      title: "Update target"
    });

    const getRoleResponse = await request(`/api/roles/${role.uuid}`);

    expect(getRoleResponse.status).toBe(200);
    expect(await getRoleResponse.json()).toMatchObject({
      uuid: role.uuid,
      permissions: ["permissions:update-target"]
    });
  });

  it("deletes a permission and detaches it from roles", async () => {
    const createResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "permissions:delete",
        title: "Delete permission"
      }
    });

    expect(createResponse.status).toBe(201);

    const permission: PermissionResponse = await createResponse.json();
    const firstRoleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "permission-delete-a",
        title: "Permission Delete A",
        permissions: ["permissions:delete"]
      }
    });
    const secondRoleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "permission-delete-b",
        title: "Permission Delete B",
        permissions: ["permissions:delete"]
      }
    });

    expect(firstRoleResponse.status).toBe(201);
    expect(secondRoleResponse.status).toBe(201);

    const firstRole = await firstRoleResponse.json();
    const secondRole = await secondRoleResponse.json();
    const deleteResponse = await request(
      `/api/permissions/${permission.uuid}`,
      {
        method: "DELETE"
      }
    );

    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ deleted: true });

    const getPermissionResponse = await request(
      `/api/permissions/${permission.uuid}`
    );
    const getFirstRoleResponse = await request(`/api/roles/${firstRole.uuid}`);
    const getSecondRoleResponse = await request(
      `/api/roles/${secondRole.uuid}`
    );

    expect(getPermissionResponse.status).toBe(404);
    expect(getFirstRoleResponse.status).toBe(200);
    expect(getSecondRoleResponse.status).toBe(200);
    expect(await getFirstRoleResponse.json()).toMatchObject({
      uuid: firstRole.uuid,
      permissions: []
    });
    expect(await getSecondRoleResponse.json()).toMatchObject({
      uuid: secondRole.uuid,
      permissions: []
    });
  });

  it("reuses dynamically created permissions from role routes", async () => {
    const firstRoleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "shared-permission-a",
        title: "Shared Permission A",
        permissions: ["shared:permission"]
      }
    });
    const secondRoleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "shared-permission-b",
        title: "Shared Permission B",
        permissions: ["shared:permission"]
      }
    });

    expect(firstRoleResponse.status).toBe(201);
    expect(secondRoleResponse.status).toBe(201);

    const listResponse = await request("/api/permissions");

    expect(listResponse.status).toBe(200);

    const permissions = await paginatedItems<PermissionResponse>(listResponse);
    const sharedPermissions = permissions.filter(
      (permission) => permission.key === "shared:permission"
    );

    expect(sharedPermissions).toHaveLength(1);
    expect(sharedPermissions[0]).toMatchObject({
      key: "shared:permission",
      title: null
    });
  });

  it("keeps permission entities when roles detach them", async () => {
    const createRoleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "detached-permission-role",
        title: "Detached Permission Role",
        permissions: ["detached:permission"]
      }
    });

    expect(createRoleResponse.status).toBe(201);

    const role = await createRoleResponse.json();
    const clearRoleResponse = await request(`/api/roles/${role.uuid}`, {
      method: "PATCH",
      body: {
        permissions: []
      }
    });

    expect(clearRoleResponse.status).toBe(200);
    expect(await clearRoleResponse.json()).toMatchObject({
      uuid: role.uuid,
      permissions: []
    });

    const listResponse = await request("/api/permissions");

    expect(listResponse.status).toBe(200);

    const permissions = await paginatedItems<PermissionResponse>(listResponse);

    expect(permissions).toContainEqual(
      expect.objectContaining({
        key: "detached:permission",
        title: null
      })
    );
  });

  it("creates missing permission entities when roles are updated", async () => {
    const createRoleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "update-created-permission",
        title: "Update Created Permission"
      }
    });

    expect(createRoleResponse.status).toBe(201);

    const role = await createRoleResponse.json();
    const updateRoleResponse = await request(`/api/roles/${role.uuid}`, {
      method: "PATCH",
      body: {
        permissions: ["roles:update-created-permission"]
      }
    });

    expect(updateRoleResponse.status).toBe(200);
    expect(await updateRoleResponse.json()).toMatchObject({
      uuid: role.uuid,
      permissions: ["roles:update-created-permission"]
    });

    const listResponse = await request("/api/permissions");

    expect(listResponse.status).toBe(200);

    const permissions = await paginatedItems<PermissionResponse>(listResponse);

    expect(permissions).toContainEqual(
      expect.objectContaining({
        key: "roles:update-created-permission",
        title: null
      })
    );
  });

  it("returns 404 when a permission does not exist", async () => {
    const missingUuid = "00000000-0000-4000-8000-000000000000";
    const getResponse = await request(`/api/permissions/${missingUuid}`);
    const updateResponse = await request(`/api/permissions/${missingUuid}`, {
      method: "PATCH",
      body: {
        title: "Missing permission"
      }
    });
    const deleteResponse = await request(`/api/permissions/${missingUuid}`, {
      method: "DELETE"
    });

    expect(getResponse.status).toBe(404);
    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
    expect(await getResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Permission not found"
      }
    });
    expect(await updateResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Permission not found"
      }
    });
    expect(await deleteResponse.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Permission not found"
      }
    });
  });

  it("rejects duplicate permission keys and invalid input", async () => {
    const firstResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "permissions:duplicate"
      }
    });

    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "permissions:duplicate"
      }
    });
    const invalidBodyResponse = await request("/api/permissions", {
      method: "POST",
      body: {
        key: "Invalid Permission",
        title: ""
      }
    });
    const invalidGetResponse = await request("/api/permissions/not-a-uuid");

    expect(duplicateResponse.status).toBe(400);
    expect(await duplicateResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Permission key already exists"
      }
    });
    expect(invalidBodyResponse.status).toBe(400);
    expect(invalidGetResponse.status).toBe(400);
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
  });
});
