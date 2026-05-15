import { describe, expect, it } from "bun:test";
import { paginatedItems, request } from "@/test/e2e/helpers/helpers";

type AccountResponse = {
  uuid: string;
  name: string;
  externalId: string;
};

let accountExternalIdSequence = 800000000000000000n;

describe("sessions", () => {
  it("resolves guests and returns stable opaque player IDs for the same tuple", async () => {
    const input = {
      roomId: "room-guest",
      roomPlayerId: 1,
      name: "GuestOne",
      auth: null,
      conn: "conn-guest"
    };

    const firstResponse = await request("/api/sessions/resolve", {
      method: "POST",
      body: input
    });
    const secondResponse = await request("/api/sessions/resolve", {
      method: "POST",
      body: input
    });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const firstBody = await firstResponse.json();
    const secondBody = await secondResponse.json();

    expect(firstBody).toEqual({
      status: "guest",
      playerId: expect.any(String),
      account: null
    });
    expect(secondBody).toEqual(firstBody);
  });

  it("creates distinct player identities for different room IDs", async () => {
    const firstResponse = await request("/api/sessions/resolve", {
      method: "POST",
      body: {
        roomId: "room-a",
        roomPlayerId: 10,
        name: "RoomScoped",
        auth: "auth-room-scoped",
        conn: "conn-room-scoped"
      }
    });
    const secondResponse = await request("/api/sessions/resolve", {
      method: "POST",
      body: {
        roomId: "room-b",
        roomPlayerId: 10,
        name: "RoomScoped",
        auth: "auth-room-scoped",
        conn: "conn-room-scoped"
      }
    });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const first = await firstResponse.json();
    const second = await secondResponse.json();

    expect(first.status).toBe("guest");
    expect(second.status).toBe("guest");
    expect(second.playerId).not.toBe(first.playerId);
  });

  it("creates distinct player identities for different room player IDs", async () => {
    const firstResponse = await request("/api/sessions/resolve", {
      method: "POST",
      body: {
        roomId: "room-player-id-scope",
        roomPlayerId: 2,
        name: "SlotScoped",
        auth: "auth-slot-scoped",
        conn: "conn-slot-scoped"
      }
    });
    const secondResponse = await request("/api/sessions/resolve", {
      method: "POST",
      body: {
        roomId: "room-player-id-scope",
        roomPlayerId: 3,
        name: "SlotScoped",
        auth: "auth-slot-scoped",
        conn: "conn-slot-scoped"
      }
    });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const first = await firstResponse.json();
    const second = await secondResponse.json();

    expect(first.status).toBe("guest");
    expect(second.status).toBe("guest");
    expect(second.playerId).not.toBe(first.playerId);
  });

  it("requires a password when the room player name exactly matches an account name", async () => {
    const accountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: uniqueName("ExactName"),
        password: "pass1234",
        externalId: uniqueAccountExternalId()
      }
    });

    expect(accountResponse.status).toBe(201);

    const account = sessionAccount(await accountResponse.json());
    const response = await request("/api/sessions/resolve", {
      method: "POST",
      body: {
        roomId: "room-password-required",
        roomPlayerId: 4,
        name: account.name,
        auth: "auth-password-required",
        conn: "conn-password-required"
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "password_required",
      playerId: expect.any(String),
      account
    });
  });

  it("does not match account names with different casing", async () => {
    const accountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: uniqueName("CaseExact"),
        password: "pass1234",
        externalId: uniqueAccountExternalId()
      }
    });

    expect(accountResponse.status).toBe(201);

    const response = await request("/api/sessions/resolve", {
      method: "POST",
      body: {
        roomId: "room-case",
        roomPlayerId: 5,
        name: "caseexact",
        auth: null,
        conn: "conn-case"
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "guest",
      playerId: expect.any(String),
      account: null
    });
  });

  it("does not update account auth when password confirmation is invalid", async () => {
    const accountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: uniqueName("InvalidPass"),
        password: "pass1234",
        externalId: uniqueAccountExternalId()
      }
    });

    expect(accountResponse.status).toBe(201);

    const account = sessionAccount(await accountResponse.json());
    const response = await request("/api/sessions/confirm", {
      method: "POST",
      body: {
        roomId: "room-invalid-password",
        roomPlayerId: 6,
        name: account.name,
        auth: "auth-invalid-password",
        conn: "conn-invalid-password",
        password: "wrongpass"
      }
    });
    const authResolveResponse = await request("/api/sessions/resolve", {
      method: "POST",
      body: {
        roomId: "room-invalid-password-check",
        roomPlayerId: 7,
        name: "DifferentName",
        auth: "auth-invalid-password",
        conn: "conn-invalid-password-check"
      }
    });

    expect(response.status).toBe(200);
    expect(authResolveResponse.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });

    const authResolve = await authResolveResponse.json();

    expect(authResolve.status).toBe("guest");
  });

  it("confirms a valid password, associates the player, and enables auth auto sign-in", async () => {
    const accountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: uniqueName("ValidPass"),
        password: "pass1234",
        externalId: uniqueAccountExternalId()
      }
    });

    expect(accountResponse.status).toBe(201);

    const account = sessionAccount(await accountResponse.json());
    const auth = "auth-valid-password";
    const confirmResponse = await request("/api/sessions/confirm", {
      method: "POST",
      body: {
        roomId: "room-valid-password",
        roomPlayerId: 8,
        name: account.name,
        auth,
        conn: "conn-valid-password",
        password: "pass1234"
      }
    });

    expect(confirmResponse.status).toBe(200);

    const confirm = await confirmResponse.json();

    expect(confirm).toEqual({
      valid: true,
      playerId: expect.any(String),
      account,
      canonicalName: account.name
    });

    if (!confirm.valid) {
      throw new Error("Expected session confirmation to be valid");
    }

    const playerResponse = await request(`/api/players/${confirm.playerId}`);

    expect(playerResponse.status).toBe(200);
    expect(await playerResponse.json()).toMatchObject({
      id: confirm.playerId,
      name: account.name,
      account
    });

    const autoSignInResponse = await request("/api/sessions/resolve", {
      method: "POST",
      body: {
        roomId: "room-valid-password-next",
        roomPlayerId: 9,
        name: "WrongRoomName",
        auth,
        conn: "conn-valid-password-next"
      }
    });

    expect(autoSignInResponse.status).toBe(200);
    const autoSignIn = await autoSignInResponse.json();

    expect(autoSignIn).toEqual({
      status: "signed_in",
      playerId: expect.any(String),
      account,
      canonicalName: account.name
    });
  });

  it("clears the same auth from the previous account when another account confirms it", async () => {
    const firstAccountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: uniqueName("FirstAuth"),
        password: "pass1234",
        externalId: uniqueAccountExternalId()
      }
    });
    const secondAccountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: uniqueName("SecondAuth"),
        password: "pass1234",
        externalId: uniqueAccountExternalId()
      }
    });

    expect(firstAccountResponse.status).toBe(201);
    expect(secondAccountResponse.status).toBe(201);

    const firstAccount = sessionAccount(await firstAccountResponse.json());
    const secondAccount = sessionAccount(await secondAccountResponse.json());
    const sharedAuth = "auth-account-transfer";

    const firstConfirmResponse = await request("/api/sessions/confirm", {
      method: "POST",
      body: {
        roomId: "room-first-auth",
        roomPlayerId: 11,
        name: firstAccount.name,
        auth: sharedAuth,
        conn: "conn-first-auth",
        password: "pass1234"
      }
    });
    const secondConfirmResponse = await request("/api/sessions/confirm", {
      method: "POST",
      body: {
        roomId: "room-second-auth",
        roomPlayerId: 12,
        name: secondAccount.name,
        auth: sharedAuth,
        conn: "conn-second-auth",
        password: "pass1234"
      }
    });
    const resolveWithSharedAuthResponse = await request(
      "/api/sessions/resolve",
      {
        method: "POST",
        body: {
          roomId: "room-shared-auth-check",
          roomPlayerId: 13,
          name: "AnyName",
          auth: sharedAuth,
          conn: "conn-shared-auth-check"
        }
      }
    );
    const firstNeedsPasswordAgainResponse = await request(
      "/api/sessions/resolve",
      {
        method: "POST",
        body: {
          roomId: "room-first-auth-check",
          roomPlayerId: 14,
          name: firstAccount.name,
          auth: "auth-first-new-device",
          conn: "conn-first-auth-check"
        }
      }
    );

    expect(firstConfirmResponse.status).toBe(200);
    expect(secondConfirmResponse.status).toBe(200);
    expect(resolveWithSharedAuthResponse.status).toBe(200);
    expect(firstNeedsPasswordAgainResponse.status).toBe(200);

    const firstConfirm = await firstConfirmResponse.json();
    const secondConfirm = await secondConfirmResponse.json();
    const resolveWithSharedAuth = await resolveWithSharedAuthResponse.json();
    const firstNeedsPasswordAgain =
      await firstNeedsPasswordAgainResponse.json();

    expect(firstConfirm.valid).toBe(true);
    expect(secondConfirm).toEqual({
      valid: true,
      playerId: expect.any(String),
      account: secondAccount,
      canonicalName: secondAccount.name
    });
    expect(resolveWithSharedAuth).toMatchObject({
      status: "signed_in",
      account: secondAccount,
      canonicalName: secondAccount.name
    });
    expect(firstNeedsPasswordAgain).toMatchObject({
      status: "password_required",
      account: firstAccount
    });
  });

  it("supports null auth and conn values", async () => {
    const accountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: uniqueName("NullFields"),
        password: "pass1234",
        externalId: uniqueAccountExternalId()
      }
    });

    expect(accountResponse.status).toBe(201);

    const account = sessionAccount(await accountResponse.json());
    const guestResponse = await request("/api/sessions/resolve", {
      method: "POST",
      body: {
        roomId: "room-null-fields",
        roomPlayerId: 15,
        name: "NullGuest",
        auth: null,
        conn: null
      }
    });
    const confirmResponse = await request("/api/sessions/confirm", {
      method: "POST",
      body: {
        roomId: "room-null-confirm",
        roomPlayerId: 16,
        name: account.name,
        auth: null,
        conn: null,
        password: "pass1234"
      }
    });

    expect(guestResponse.status).toBe(200);
    expect(confirmResponse.status).toBe(200);

    const guest = await guestResponse.json();
    const confirm = await confirmResponse.json();

    expect(guest.status).toBe("guest");
    expect(confirm).toEqual({
      valid: true,
      playerId: expect.any(String),
      account,
      canonicalName: account.name
    });
  });

  it("hydrates account data on match player events and participations", async () => {
    const accountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: uniqueName("MatchHydrate"),
        password: "pass1234",
        externalId: uniqueAccountExternalId()
      }
    });

    expect(accountResponse.status).toBe(201);

    const account = sessionAccount(await accountResponse.json());
    const sessionResponse = await request("/api/sessions/confirm", {
      method: "POST",
      body: {
        roomId: "room-match-hydration",
        roomPlayerId: 17,
        name: account.name,
        auth: "auth-match-hydration",
        conn: "conn-match-hydration",
        password: "pass1234"
      }
    });

    expect(sessionResponse.status).toBe(200);

    const session = await sessionResponse.json();

    expect(session.valid).toBe(true);

    const createMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        events: [
          {
            type: "player_join",
            playerId: session.playerId,
            team: "red",
            roomPlayerId: 17
          }
        ]
      }
    });

    expect(createMatchResponse.status).toBe(201);

    const match = await createMatchResponse.json();

    expect(match.events[0].player).toMatchObject({
      id: session.playerId,
      account
    });
    expect(match.participations[0].player).toMatchObject({
      id: session.playerId,
      account
    });
  });

  it("hydrates account data on stat events and metrics", async () => {
    const accountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: uniqueName("StatHydrate"),
        password: "pass1234",
        externalId: uniqueAccountExternalId()
      }
    });

    expect(accountResponse.status).toBe(201);

    const account = sessionAccount(await accountResponse.json());
    const sessionResponse = await request("/api/sessions/confirm", {
      method: "POST",
      body: {
        roomId: "room-stat-hydration",
        roomPlayerId: 18,
        name: account.name,
        auth: "auth-stat-hydration",
        conn: "conn-stat-hydration",
        password: "pass1234"
      }
    });
    const schemaResponse = await request("/api/stat-event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("session-stats"),
        definition: {
          events: [
            {
              type: "touchdown",
              valueSchema: {
                type: "number",
                minimum: 0
              },
              aggregations: [
                {
                  metric: "points",
                  initial: 0,
                  step: {
                    op: "add",
                    args: [
                      {
                        path: "acc"
                      },
                      {
                        path: "event.value"
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      }
    });

    expect(sessionResponse.status).toBe(200);
    expect(schemaResponse.status).toBe(201);

    const session = await sessionResponse.json();
    const schema = await schemaResponse.json();

    expect(session.valid).toBe(true);

    const matchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        statEventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(matchResponse.status).toBe(201);

    const match = await matchResponse.json();
    const addResponse = await request(`/api/matches/${match.id}/stat-events`, {
      method: "POST",
      body: {
        type: "touchdown",
        playerId: session.playerId,
        value: 6
      }
    });
    const listResponse = await request(`/api/matches/${match.id}/stat-events`);
    const metricsResponse = await request(`/api/matches/${match.id}/metrics`);

    expect(addResponse.status).toBe(201);
    expect(await addResponse.json()).toMatchObject({
      player: {
        id: session.playerId,
        account
      }
    });

    expect(listResponse.status).toBe(200);
    expect(await paginatedItems(listResponse)).toContainEqual(
      expect.objectContaining({
        player: expect.objectContaining({
          id: session.playerId,
          account
        })
      })
    );

    expect(metricsResponse.status).toBe(200);
    expect(await metricsResponse.json()).toContainEqual({
      player: expect.objectContaining({
        id: session.playerId,
        account
      }),
      metrics: {
        points: 6
      }
    });
  });
});

function uniqueAccountExternalId(): string {
  accountExternalIdSequence += 1n;

  return accountExternalIdSequence.toString();
}

function uniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function sessionAccount(account: AccountResponse): AccountResponse {
  return {
    uuid: account.uuid,
    name: account.name,
    externalId: account.externalId
  };
}
