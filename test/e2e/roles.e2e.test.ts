import { describe, expect, it } from "bun:test";
import { request } from "./helpers";

describe("roles", () => {
  it("creates a role", async () => {
    const response = await request("/api/roles", {
      method: "POST",
      body: {
        name: "Coach"
      }
    });

    expect(response.status).toBe(201);

    const role = await response.json();

    expect(role).toMatchObject({
      uuid: expect.any(String),
      name: "Coach",
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
        name: "Manager"
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
        isDefault: true
      })
    );
  });

  it("gets a role by UUID", async () => {
    const createResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "Analyst"
      }
    });

    expect(createResponse.status).toBe(201);

    const role = await createResponse.json();
    const response = await request(`/api/roles/${role.uuid}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(role);
  });

  it("removes a role", async () => {
    const createResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "Retired"
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

  it("moves assigned accounts to the default role when a role is removed", async () => {
    const roleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "Temporary"
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
        isDefault: true
      }
    });
  });

  it("does not remove the default role", async () => {
    const listResponse = await request("/api/roles");

    expect(listResponse.status).toBe(200);

    const roles = (await listResponse.json()) as Array<{
      uuid: string;
      isDefault: boolean;
    }>;
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
        name: "default"
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
});
