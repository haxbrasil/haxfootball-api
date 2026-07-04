import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  createLiveRoomFixture,
  type LiveRoomFixture
} from "@/test/e2e/helpers/live-state";
import { createAuthToken, request } from "@/test/e2e/helpers/helpers";
import { startE2eServer, type E2eServer } from "@/test/e2e/helpers/server";
import { wait } from "@/test/e2e/helpers/timing";

describe("live state control socket", () => {
  let server: E2eServer;
  let token: string;

  beforeAll(async () => {
    token = await createAuthToken();
    server = await startE2eServer();
  });

  afterAll(() => {
    server.stop();
  });

  it("rejects invalid socket frames without crashing the connection", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    socket.send("{");

    expect(await nextJsonMessage(socket)).toMatchObject({
      type: "api.pong",
      accepted: false,
      requiresSnapshot: true,
      error: "Invalid live state message"
    });

    socket.close();
  });

  it("rejects control sockets without authentication", async () => {
    const fixture = await createLiveRoomFixture();

    await expect(
      tryOpenControlSocket(server, fixture, {})
    ).resolves.toMatchObject({
      opened: false
    });
  });

  it("rejects control sockets with invalid authentication", async () => {
    const fixture = await createLiveRoomFixture();

    await expect(
      tryOpenControlSocket(server, fixture, {
        authorization: "Bearer invalid"
      })
    ).resolves.toMatchObject({
      opened: false
    });
  });

  it("rejects snapshots before room ping", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    socket.send(
      JSON.stringify({
        type: "room.snapshot",
        snapshot: minimalSnapshot(1)
      })
    );

    expect(await nextJsonMessage(socket)).toMatchObject({
      type: "api.pong",
      accepted: false,
      requiresSnapshot: true,
      error: "Room ping is required before snapshots"
    });

    socket.close();
  });

  it("rejects room ping with the wrong communication ID", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    socket.send(
      JSON.stringify({
        type: "room.ping",
        protocolVersion: 1,
        commId: "wrong",
        snapshotRevision: null
      })
    );

    expect(await nextJsonMessage(socket)).toMatchObject({
      type: "api.pong",
      accepted: false,
      requiresSnapshot: true,
      error: "Invalid room communication ID"
    });

    socket.close();
  });

  it("rejects room ping for an unknown room", async () => {
    const fixture = {
      roomId: crypto.randomUUID(),
      commId: crypto.randomUUID()
    };
    const socket = await openControlSocket(server, token, fixture);

    socket.send(
      JSON.stringify({
        type: "room.ping",
        protocolVersion: 1,
        commId: fixture.commId,
        snapshotRevision: null
      })
    );

    expect(await nextJsonMessage(socket)).toMatchObject({
      type: "api.pong",
      accepted: false,
      requiresSnapshot: true,
      error: "Room not found"
    });

    socket.close();
  });

  it("rejects room ping for terminal rooms", async () => {
    const closed = await createLiveRoomFixture({ state: "closed" });
    const failed = await createLiveRoomFixture({ state: "failed" });

    for (const fixture of [closed, failed]) {
      const socket = await openControlSocket(server, token, fixture);

      socket.send(
        JSON.stringify({
          type: "room.ping",
          protocolVersion: 1,
          commId: fixture.commId,
          snapshotRevision: null
        })
      );

      expect(await nextJsonMessage(socket)).toMatchObject({
        type: "api.pong",
        accepted: false,
        requiresSnapshot: true,
        error: "Live room control is not available for terminal rooms"
      });

      socket.close();
    }
  });

  it("accepts room ping for provisioning rooms", async () => {
    const fixture = await createLiveRoomFixture({ state: "provisioning" });
    const socket = await openControlSocket(server, token, fixture);

    await pingRoom(socket, fixture);

    socket.close();
  });

  it("accepts room ping and publishes snapshots to GraphQL", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    await pingRoom(socket, fixture);
    socket.send(
      JSON.stringify({
        type: "room.snapshot",
        snapshot: {
          ...minimalSnapshot(2),
          room: {
            name: "Socket Room",
            teamsLocked: false,
            gameStatus: "running",
            scores: {
              red: 21,
              blue: 14
            }
          },
          players: [
            {
              roomPlayerId: 4,
              name: "Socket Player",
              team: "blue",
              admin: false,
              avatar: null,
              desynced: true,
              sessionKind: "guest",
              playable: true,
              playBlockedReason: null
            }
          ]
        }
      })
    );

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query LiveRoom($id: ID!) {
            liveRoom(id: $id) {
              connected
              revision
              room {
                name
                gameStatus
                scores {
                  red
                  blue
                }
              }
              players(where: { desynced: { equals: true } }) {
                edges {
                  node {
                    name
                    team
                    sessionKind
                  }
                }
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        liveRoom: {
          connected: true,
          revision: 2,
          room: {
            name: "Socket Room",
            gameStatus: "RUNNING",
            scores: {
              red: 21,
              blue: 14
            }
          },
          players: {
            edges: [
              {
                node: {
                  name: "Socket Player",
                  team: "BLUE",
                  sessionKind: "GUEST"
                }
              }
            ]
          }
        }
      }
    });

    socket.close();
  });

  it("rejects invalid snapshots after room ping", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    await pingRoom(socket, fixture);
    socket.send(
      JSON.stringify({
        type: "room.snapshot",
        snapshot: {
          ...minimalSnapshot(2),
          stateDocuments: [
            {
              name: "unknown",
              version: 1,
              payload: {}
            }
          ]
        }
      })
    );

    expect(await nextJsonMessage(socket)).toMatchObject({
      type: "api.pong",
      accepted: false,
      requiresSnapshot: true,
      error: "Room published state documents without a contract"
    });

    socket.close();
  });

  it("marks live room disconnected when the control socket closes", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    await pingRoom(socket, fixture);
    socket.send(
      JSON.stringify({
        type: "room.snapshot",
        snapshot: minimalSnapshot(1)
      })
    );
    await wait(25);
    socket.close();
    await wait(50);

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query LiveRoom($id: ID!) {
            liveRoom(id: $id) {
              connected
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        liveRoom: {
          connected: false
        }
      }
    });
  });

  it("delivers queued commands to a connected socket and accepts command results", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    await pingRoom(socket, fixture);

    const enqueueResponse = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          mutation Enqueue($input: EnqueueLiveRoomCommandInput!) {
            enqueueLiveRoomCommand(input: $input) {
              id
              status
              sentAt
            }
          }
        `,
        variables: {
          input: {
            roomId: fixture.roomId,
            name: "ping",
            payload: { nonce: "socket" }
          }
        }
      }
    });
    const command = (await enqueueResponse.json()).data.enqueueLiveRoomCommand;

    expect(command).toMatchObject({
      status: "SENT",
      sentAt: expect.any(String)
    });
    expect(await nextJsonMessage(socket)).toEqual({
      type: "api.command",
      command: expect.objectContaining({
        id: command.id,
        roomId: fixture.roomId,
        name: "ping",
        payload: { nonce: "socket" }
      })
    });

    socket.send(
      JSON.stringify({
        type: "room.command-result",
        commandId: command.id,
        ok: true,
        result: { pong: true }
      })
    );

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

    socket.close();
  });

  it("delivers commands that were queued before room ping", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    const enqueueResponse = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          mutation Enqueue($input: EnqueueLiveRoomCommandInput!) {
            enqueueLiveRoomCommand(input: $input) {
              id
              status
            }
          }
        `,
        variables: {
          input: {
            roomId: fixture.roomId,
            name: "ping",
            payload: { nonce: "queued-before-ping" }
          }
        }
      }
    });
    const command = (await enqueueResponse.json()).data.enqueueLiveRoomCommand;

    expect(command.status).toBe("QUEUED");

    socket.send(
      JSON.stringify({
        type: "room.ping",
        protocolVersion: 1,
        commId: fixture.commId,
        snapshotRevision: null
      })
    );

    const messages = await nextJsonMessages(socket, 2);

    expect(messages).toContainEqual({
      type: "api.pong",
      accepted: true,
      requiresSnapshot: true,
      serverTime: expect.any(String)
    });
    expect(messages).toContainEqual({
      type: "api.command",
      command: expect.objectContaining({
        id: command.id,
        roomId: fixture.roomId,
        name: "ping",
        payload: { nonce: "queued-before-ping" }
      })
    });

    socket.close();
  });

  it("accepts failed command results from the control socket", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    await pingRoom(socket, fixture);

    const enqueueResponse = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          mutation Enqueue($input: EnqueueLiveRoomCommandInput!) {
            enqueueLiveRoomCommand(input: $input) {
              id
            }
          }
        `,
        variables: {
          input: {
            roomId: fixture.roomId,
            name: "ping",
            payload: { nonce: "socket-failed" }
          }
        }
      }
    });
    const command = (await enqueueResponse.json()).data.enqueueLiveRoomCommand;

    await nextJsonMessage(socket);

    socket.send(
      JSON.stringify({
        type: "room.command-result",
        commandId: command.id,
        ok: false,
        error: "No active game"
      })
    );

    const listResponse = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Commands($roomId: ID!) {
            liveRoomCommands(roomId: $roomId, status: FAILED) {
              edges {
                node {
                  id
                  status
                  result
                  error
                }
              }
            }
          }
        `,
        variables: { roomId: fixture.roomId }
      }
    });

    expect(await listResponse.json()).toEqual({
      data: {
        liveRoomCommands: {
          edges: [
            {
              node: {
                id: command.id,
                status: "FAILED",
                result: null,
                error: "No active game"
              }
            }
          ]
        }
      }
    });

    socket.close();
  });

  it("rejects command results for unknown commands", async () => {
    const fixture = await createLiveRoomFixture();
    const socket = await openControlSocket(server, token, fixture);

    await pingRoom(socket, fixture);
    socket.send(
      JSON.stringify({
        type: "room.command-result",
        commandId: crypto.randomUUID(),
        ok: true,
        result: { ignored: true }
      })
    );

    expect(await nextJsonMessage(socket)).toMatchObject({
      type: "api.pong",
      accepted: false,
      requiresSnapshot: false,
      error: "Live room command not found"
    });

    socket.close();
  });

  it("isolates command delivery between connected rooms", async () => {
    const first = await createLiveRoomFixture();
    const second = await createLiveRoomFixture();
    const firstSocket = await openControlSocket(server, token, first);
    const secondSocket = await openControlSocket(server, token, second);

    await pingRoom(firstSocket, first);
    await pingRoom(secondSocket, second);

    const enqueueResponse = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          mutation Enqueue($input: EnqueueLiveRoomCommandInput!) {
            enqueueLiveRoomCommand(input: $input) {
              id
            }
          }
        `,
        variables: {
          input: {
            roomId: second.roomId,
            name: "ping",
            payload: { target: "second" }
          }
        }
      }
    });
    const command = (await enqueueResponse.json()).data.enqueueLiveRoomCommand;

    expect(await nextJsonMessage(secondSocket)).toEqual({
      type: "api.command",
      command: expect.objectContaining({
        id: command.id,
        roomId: second.roomId,
        payload: { target: "second" }
      })
    });

    firstSocket.send(
      JSON.stringify({
        type: "room.command-result",
        commandId: command.id,
        ok: false,
        error: "Wrong room"
      })
    );

    expect(await nextJsonMessage(firstSocket)).toMatchObject({
      type: "api.pong",
      accepted: false,
      requiresSnapshot: false,
      error: "Live room command does not belong to this room"
    });

    firstSocket.close();
    secondSocket.close();
  });

  it("keeps the newest duplicate room control socket active", async () => {
    const fixture = await createLiveRoomFixture();
    const oldSocket = await openControlSocket(server, token, fixture);
    const newSocket = await openControlSocket(server, token, fixture);

    await pingRoom(oldSocket, fixture);
    await pingRoom(newSocket, fixture);

    oldSocket.send(
      JSON.stringify({
        type: "room.snapshot",
        snapshot: {
          ...minimalSnapshot(2),
          room: {
            name: "Old socket update",
            teamsLocked: false,
            gameStatus: "running",
            scores: null
          }
        }
      })
    );

    expect(await nextJsonMessage(oldSocket)).toMatchObject({
      type: "api.pong",
      accepted: false,
      requiresSnapshot: false,
      error: "Room control connection is not active"
    });

    oldSocket.close();
    await wait(25);

    newSocket.send(
      JSON.stringify({
        type: "room.snapshot",
        snapshot: {
          ...minimalSnapshot(3),
          room: {
            name: "New socket update",
            teamsLocked: false,
            gameStatus: "running",
            scores: null
          }
        }
      })
    );

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              connected
              revision
              room {
                name
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect(await response.json()).toEqual({
      data: {
        liveRoom: {
          connected: true,
          revision: 3,
          room: {
            name: "New socket update"
          }
        }
      }
    });

    newSocket.close();
  });

  it("delivers commands only to the newest duplicate room control socket", async () => {
    const fixture = await createLiveRoomFixture();
    const oldSocket = await openControlSocket(server, token, fixture);
    const newSocket = await openControlSocket(server, token, fixture);

    await pingRoom(oldSocket, fixture);
    await pingRoom(newSocket, fixture);

    const command = await enqueueSocketCommand(fixture.roomId, {
      target: "newest"
    });

    expect(await nextJsonMessage(newSocket)).toEqual({
      type: "api.command",
      command: expect.objectContaining({
        id: command.id,
        roomId: fixture.roomId,
        payload: { target: "newest" }
      })
    });

    oldSocket.send(
      JSON.stringify({
        type: "room.command-result",
        commandId: command.id,
        ok: true,
        result: { ignored: true }
      })
    );

    expect(await nextJsonMessage(oldSocket)).toMatchObject({
      type: "api.pong",
      accepted: false,
      requiresSnapshot: false,
      error: "Room control connection is not active"
    });

    newSocket.close();
    oldSocket.close();
  });
});

async function openControlSocket(
  server: E2eServer,
  token: string,
  fixture: LiveRoomFixture
): Promise<WebSocket> {
  const url = `${server.baseUrl.replace("http:", "ws:")}/api/rooms/${
    fixture.roomId
  }/control`;

  return new Promise((resolve, reject) => {
    const socket = createSocket(url, {
      authorization: `Bearer ${token}`
    });
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for socket open")),
      2_000
    );

    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Socket failed to open"));
    });
  });
}

function tryOpenControlSocket(
  server: E2eServer,
  fixture: LiveRoomFixture,
  headers: Record<string, string>
): Promise<{ opened: boolean }> {
  const url = `${server.baseUrl.replace("http:", "ws:")}/api/rooms/${
    fixture.roomId
  }/control`;

  return new Promise((resolve) => {
    const socket = createSocket(url, headers);
    const timeout = setTimeout(() => {
      socket.close();
      resolve({ opened: false });
    }, 500);

    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      socket.close();
      resolve({ opened: true });
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      resolve({ opened: false });
    });
    socket.addEventListener("close", () => {
      clearTimeout(timeout);
      resolve({ opened: false });
    });
  });
}

function createSocket(url: string, headers: Record<string, string>): WebSocket {
  return new (WebSocket as unknown as {
    new (url: string, options: { headers: Record<string, string> }): WebSocket;
  })(url, { headers });
}

async function pingRoom(
  socket: WebSocket,
  fixture: LiveRoomFixture
): Promise<void> {
  socket.send(
    JSON.stringify({
      type: "room.ping",
      protocolVersion: 1,
      commId: fixture.commId,
      snapshotRevision: null
    })
  );

  expect(await nextJsonMessage(socket)).toMatchObject({
    type: "api.pong",
    accepted: true,
    requiresSnapshot: true
  });
}

function nextJsonMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for socket message")),
      2_000
    );

    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        resolve(JSON.parse(String(event.data)));
      },
      { once: true }
    );
  });
}

function nextJsonMessages(
  socket: WebSocket,
  count: number
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const messages: unknown[] = [];
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for socket messages")),
      2_000
    );
    const onMessage = (event: MessageEvent) => {
      messages.push(JSON.parse(String(event.data)));

      if (messages.length === count) {
        clearTimeout(timeout);
        socket.removeEventListener("message", onMessage);
        resolve(messages);
      }
    };

    socket.addEventListener("message", onMessage);
  });
}

function minimalSnapshot(revision: number) {
  return {
    revision,
    room: {
      name: "Minimal Room",
      teamsLocked: null,
      gameStatus: "stopped",
      scores: null
    },
    players: []
  };
}

async function enqueueSocketCommand(
  roomId: string,
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  const response = await request("/api/graphql", {
    method: "POST",
    body: {
      query: `
        mutation Enqueue($input: EnqueueLiveRoomCommandInput!) {
          enqueueLiveRoomCommand(input: $input) {
            id
          }
        }
      `,
      variables: {
        input: {
          roomId,
          name: "ping",
          payload
        }
      }
    }
  });

  return (await response.json()).data.enqueueLiveRoomCommand;
}
