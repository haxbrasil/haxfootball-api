import { describe, expect, it } from "bun:test";
import type { AccountResponse } from "@/features/accounts/account.contract";
import type { PlayerResponse } from "@/features/players/player.contract";
import { request } from "@/test/e2e/helpers/helpers";

describe("players", () => {
  it("adds a player", async () => {
    const response = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-1",
        name: "Striker",
        country: "br"
      }
    });

    expect(response.status).toBe(201);

    const player: PlayerResponse = await response.json();

    expect(player).toMatchObject({
      id: expect.any(Number),
      externalId: "player-1",
      name: "Striker",
      country: "br",
      account: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
  });

  it("adds a player without a country", async () => {
    const response = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-no-country",
        name: "Winger"
      }
    });

    expect(response.status).toBe(201);

    const player: PlayerResponse = await response.json();

    expect(player.country).toBeNull();
  });

  it("lists players", async () => {
    const createResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-2",
        name: "Keeper",
        country: "ar"
      }
    });

    expect(createResponse.status).toBe(201);

    const player: PlayerResponse = await createResponse.json();
    const listResponse = await request("/api/players");

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toContainEqual(player);
  });

  it("gets a player by ID", async () => {
    const createResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-3",
        name: "Playmaker",
        country: "es"
      }
    });

    expect(createResponse.status).toBe(201);

    const player: PlayerResponse = await createResponse.json();
    const getResponse = await request(`/api/players/${player.id}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(player);
  });

  it("associates a player with an account", async () => {
    const createAccountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "PlayerOwner",
        password: "pass1234",
        externalId: "923456789012345678"
      }
    });

    expect(createAccountResponse.status).toBe(201);

    const account: AccountResponse = await createAccountResponse.json();
    const createPlayerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-4",
        name: "Defender",
        country: "uy"
      }
    });

    expect(createPlayerResponse.status).toBe(201);

    const player: PlayerResponse = await createPlayerResponse.json();
    const associateResponse = await request(`/api/players/${player.id}/account`, {
      method: "PATCH",
      body: {
        accountUuid: account.uuid
      }
    });

    expect(associateResponse.status).toBe(200);
    expect(await associateResponse.json()).toMatchObject({
      id: player.id,
      externalId: "player-4",
      account: {
        uuid: account.uuid,
        name: account.name,
        externalId: account.externalId
      }
    });
  });

  it("does not replace an existing account association", async () => {
    const firstAccountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "FirstOwner",
        password: "pass1234",
        externalId: "103456789012345678"
      }
    });
    const secondAccountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: "SecondOwner",
        password: "pass1234",
        externalId: "113456789012345678"
      }
    });

    expect(firstAccountResponse.status).toBe(201);
    expect(secondAccountResponse.status).toBe(201);

    const firstAccount: AccountResponse = await firstAccountResponse.json();
    const secondAccount: AccountResponse = await secondAccountResponse.json();
    const createPlayerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-5",
        name: "Historian"
      }
    });

    expect(createPlayerResponse.status).toBe(201);

    const player: PlayerResponse = await createPlayerResponse.json();
    const firstAssociateResponse = await request(
      `/api/players/${player.id}/account`,
      {
        method: "PATCH",
        body: {
          accountUuid: firstAccount.uuid
        }
      }
    );

    expect(firstAssociateResponse.status).toBe(200);

    const secondAssociateResponse = await request(
      `/api/players/${player.id}/account`,
      {
        method: "PATCH",
        body: {
          accountUuid: secondAccount.uuid
        }
      }
    );

    expect(secondAssociateResponse.status).toBe(400);
    expect(await secondAssociateResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Player is already associated with an account"
      }
    });
  });

  it("rejects duplicate player external IDs", async () => {
    const firstResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-6",
        name: "DuplicateOne"
      }
    });

    expect(firstResponse.status).toBe(201);

    const secondResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-6",
        name: "DuplicateTwo"
      }
    });

    expect(secondResponse.status).toBe(400);
    expect(await secondResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Player external ID already exists"
      }
    });
  });

  it("rejects invalid country values", async () => {
    const response = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-invalid-country",
        name: "Traveler",
        country: "BR"
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
  });

  it("does not expose modification or removal routes", async () => {
    const createResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: "player-7",
        name: "Archived"
      }
    });

    expect(createResponse.status).toBe(201);

    const player: PlayerResponse = await createResponse.json();
    const patchResponse = await request(`/api/players/${player.id}`, {
      method: "PATCH",
      body: {
        name: "Changed"
      }
    });
    const deleteResponse = await request(`/api/players/${player.id}`, {
      method: "DELETE"
    });

    expect(patchResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });
});
