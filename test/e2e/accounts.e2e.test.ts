import { describe, expect, it } from "bun:test";
import { request } from "@/test/e2e/helpers/helpers";

describe("accounts", () => {
  it("creates an account", async () => {
    const response = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "Player1",
        password: "pass1234",
        externalId: "123456789012345678"
      }
    });

    expect(response.status).toBe(201);

    const account = await response.json();

    expect(account).toMatchObject({
      uuid: expect.any(String),
      name: "Player1",
      externalId: "123456789012345678",
      role: {
        name: "default",
        isDefault: true
      },
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
    expect(account.id).toBeUndefined();
    expect(account.password).toBeUndefined();
    expect(account.passwordHash).toBeUndefined();
  });

  it("lists accounts", async () => {
    const createResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "Player2",
        password: "pass1234",
        externalId: "223456789012345678"
      }
    });

    expect(createResponse.status).toBe(201);

    const account = await createResponse.json();
    const listResponse = await request("/api/accounts");

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toContainEqual(account);
  });

  it("gets an account by UUID", async () => {
    const createResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "Player3",
        password: "pass1234",
        externalId: "323456789012345678"
      }
    });

    expect(createResponse.status).toBe(201);

    const account = await createResponse.json();
    const getResponse = await request(`/api/accounts/${account.uuid}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(account);
  });

  it("updates an account", async () => {
    const createResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "Player4",
        password: "pass1234",
        externalId: "423456789012345678"
      }
    });

    expect(createResponse.status).toBe(201);

    const account = await createResponse.json();
    const updateResponse = await request(`/api/accounts/${account.uuid}`, {
      method: "PATCH",
      body: {
        name: "PlayerFour",
        password: "newpass1"
      }
    });

    expect(updateResponse.status).toBe(200);

    const updated = await updateResponse.json();

    expect(updated).toMatchObject({
      uuid: account.uuid,
      name: "PlayerFour",
      externalId: "423456789012345678"
    });
    expect(updated.id).toBeUndefined();
    expect(updated.password).toBeUndefined();
    expect(updated.passwordHash).toBeUndefined();
  });

  it("changes an account role", async () => {
    const roleResponse = await request("/api/roles", {
      method: "POST",
      body: {
        name: "Captain"
      }
    });

    expect(roleResponse.status).toBe(201);

    const role = await roleResponse.json();
    const createResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "Player7",
        password: "pass1234",
        externalId: "723456789012345678"
      }
    });

    expect(createResponse.status).toBe(201);

    const account = await createResponse.json();
    const updateResponse = await request(`/api/accounts/${account.uuid}`, {
      method: "PATCH",
      body: {
        roleUuid: role.uuid
      }
    });

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({
      uuid: account.uuid,
      role
    });
  });

  it("confirms a valid login", async () => {
    const createResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "Player5",
        password: "pass1234",
        externalId: "523456789012345678"
      }
    });

    expect(createResponse.status).toBe(201);

    const response = await request("/api/accounts/confirm", {
      method: "POST",
      body: {
        name: "Player5",
        password: "pass1234"
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
  });

  it("rejects an invalid login", async () => {
    const createResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "Player6",
        password: "pass1234",
        externalId: "623456789012345678"
      }
    });

    expect(createResponse.status).toBe(201);

    const response = await request("/api/accounts/confirm", {
      method: "POST",
      body: {
        name: "Player6",
        password: "wrongpass"
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
  });

  it("rejects invalid account input", async () => {
    const response = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "!!!",
        password: "123",
        externalId: "not-a-discord-id"
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
  });

  it("returns 404 for a missing account", async () => {
    const response = await request(
      "/api/accounts/00000000-0000-4000-8000-000000000000"
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Account not found"
      }
    });
  });
});
