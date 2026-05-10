import { describe, expect, it } from "bun:test";
import type { RoleResponse } from "@/features/roles/role.contract";
import { request } from "@/test/e2e/helpers/helpers";

describe("roles", () => {
  it("creates a role", async () => {
    const response = await request("/api/roles", {
      method: "POST",
      body: {
        name: "coach",
        title: "Coach"
      }
    });

    expect(response.status).toBe(201);

    const role = await response.json();

    expect(role).toMatchObject({
      uuid: expect.any(String),
      name: "coach",
      title: "Coach",
      isDefault: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
    expect(role.id).toBeUndefined();
  });

  it("lists roles", async () => {
    const createResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "manager",
        title: "Manager"
      }
    });

    expect(createResponse.status).toBe(201);

    const role = await createResponse.json();
    const response = await request("/api/roles");

    expect(response.status).toBe(200);

    const roles = await response.json();

    expect(roles).toContainEqual(role);
    expect(roles).toContainEqual(
      expect.objectContaining({
        name: "default",
        title: "Default",
        isDefault: true
      })
    );
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
    const updateAccountResponse = await request(`/api/accounts/${account.uuid}`, {
      method: "PATCH",
      body: {
        roleUuid: role.uuid
      }
    });

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
        isDefault: true
      }
    });
  });

  it("does not remove the default role", async () => {
    const listResponse = await request("/api/roles");

    expect(listResponse.status).toBe(200);

    const roles: RoleResponse[] = await listResponse.json();
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
        title: ""
      }
    });
    const invalidGetResponse = await request("/api/roles/not-a-uuid");
    const invalidDeleteResponse = await request("/api/roles/not-a-uuid", {
      method: "DELETE"
    });

    expect(invalidBodyResponse.status).toBe(400);
    expect(invalidGetResponse.status).toBe(400);
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
    expect(await invalidDeleteResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
  });
});
