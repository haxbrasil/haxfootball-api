import { describe, expect, it } from "bun:test";
import {
  acknowledgeLiveRoomCommand,
  connectLiveRoomFixture,
  createLiveRoomFixture,
  publishLiveRoomSnapshot
} from "@/test/e2e/helpers/live-state";
import { request, rawRequest } from "@/test/e2e/helpers/helpers";

describe("live state API", () => {
  it("requires authentication for GraphQL live state access", async () => {
    const response = await rawRequest("/api/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        query: "{ liveRooms { edges { node { id } } } }"
      })
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid bearer token"
      }
    });
  });

  it("queries live room snapshots through the authenticated GraphQL route", async () => {
    const fixture = await createLiveRoomFixture();

    await connectLiveRoomFixture({ roomId: fixture.roomId });
    await publishLiveRoomSnapshot(fixture.roomId, {
      revision: 1,
      room: {
        name: "E2E Live Room",
        teamsLocked: false,
        gameStatus: "running",
        scores: {
          red: 14,
          blue: 7
        }
      },
      players: [
        {
          roomPlayerId: 7,
          name: "Gabriel",
          team: "red",
          admin: true,
          avatar: null,
          desynced: false,
          sessionKind: "signed-in",
          playable: true,
          playBlockedReason: null
        }
      ]
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query LiveRooms($roomId: String!) {
            liveRooms(
              where: {
                id: { equals: $roomId }
                players: { some: { name: { equals: "Gabriel" }, team: { equals: "red" } } }
              }
            ) {
              edges {
                node {
                  id
                  connected
                  room {
                    name
                    gameStatus
                    scores {
                      red
                      blue
                    }
                  }
                  players(where: { playable: { equals: true } }) {
                    edges {
                      node {
                        roomPlayerId
                        name
                        team
                        sessionKind
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { roomId: fixture.roomId }
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        liveRooms: {
          edges: [
            {
              node: {
                id: fixture.roomId,
                connected: true,
                room: {
                  name: "E2E Live Room",
                  gameStatus: "RUNNING",
                  scores: {
                    red: 14,
                    blue: 7
                  }
                },
                players: {
                  edges: [
                    {
                      node: {
                        roomPlayerId: 7,
                        name: "Gabriel",
                        team: "RED",
                        sessionKind: "SIGNED_IN"
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      }
    });
  });

  it("enqueues, delivers, and lists live room commands through GraphQL", async () => {
    const fixture = await createLiveRoomFixture();
    const deliveredMessages: unknown[] = [];

    await connectLiveRoomFixture({
      roomId: fixture.roomId,
      deliveredMessages
    });

    const enqueueResponse = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          mutation Enqueue($input: EnqueueLiveRoomCommandInput!) {
            enqueueLiveRoomCommand(input: $input) {
              id
              roomId
              name
              payload
              status
              sentAt
            }
          }
        `,
        variables: {
          input: {
            roomId: fixture.roomId,
            name: "ping",
            payload: { nonce: "e2e" }
          }
        }
      }
    });

    expect(enqueueResponse.status).toBe(200);

    const enqueueBody = await enqueueResponse.json();
    const command = enqueueBody.data.enqueueLiveRoomCommand;

    expect(command).toMatchObject({
      roomId: fixture.roomId,
      name: "ping",
      payload: { nonce: "e2e" },
      status: "SENT",
      sentAt: expect.any(String)
    });
    expect(deliveredMessages).toEqual([
      {
        type: "api.command",
        command: expect.objectContaining({
          id: command.id,
          roomId: fixture.roomId,
          name: "ping",
          payload: { nonce: "e2e" }
        })
      }
    ]);

    await acknowledgeLiveRoomCommand({
      commandId: command.id,
      result: { pong: true }
    });

    const listResponse = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Commands($roomId: ID!) {
            liveRoomCommands(roomId: $roomId, status: ACKNOWLEDGED) {
              edges {
                node {
                  id
                  status
                  result
                }
              }
            }
          }
        `,
        variables: { roomId: fixture.roomId }
      }
    });

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      data: {
        liveRoomCommands: {
          edges: [
            {
              node: {
                id: command.id,
                status: "ACKNOWLEDGED",
                result: { pong: true }
              }
            }
          ]
        }
      }
    });
  });
});
