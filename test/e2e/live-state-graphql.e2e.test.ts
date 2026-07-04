import { describe, expect, it } from "bun:test";
import {
  acknowledgeLiveRoomCommand,
  connectLiveRoomFixture,
  createLiveRoomFixture,
  disconnectLiveRoomFixture,
  type LivePlayer,
  publishLiveRoomSnapshot,
  type LiveRoomFixture,
  type LiveRoomSnapshot,
  type RoomProgramLiveStateContract
} from "@/test/e2e/helpers/live-state";
import { request } from "@/test/e2e/helpers/helpers";

const contract: RoomProgramLiveStateContract = {
  namespace: "haxfootball",
  documents: [
    {
      name: "match",
      version: 1,
      schema: {
        type: "object",
        required: ["phase", "down", "clockRunning", "quarterback"],
        properties: {
          phase: { type: "string" },
          down: { type: "number" },
          clockRunning: { type: "boolean" },
          quarterback: { type: "string" }
        }
      }
    }
  ],
  facts: [
    {
      key: "phase",
      type: "string",
      document: "match",
      pointer: "/phase"
    },
    {
      key: "down",
      type: "number",
      document: "match",
      pointer: "/down"
    },
    {
      key: "clock-running",
      type: "boolean",
      document: "match",
      pointer: "/clockRunning"
    },
    {
      key: "quarterback",
      type: "string",
      document: "match",
      pointer: "/quarterback"
    }
  ]
};

describe("live state GraphQL queries", () => {
  it("returns null for an unknown live room", async () => {
    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Missing($id: ID!) {
            liveRoom(id: $id) {
              id
            }
          }
        `,
        variables: { id: crypto.randomUUID() }
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        liveRoom: null
      }
    });
  });

  it("returns live room and player connection nodes", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [
        {
          roomPlayerId: 7,
          name: "Node Player",
          team: "blue",
          admin: true
        }
      ]
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Rooms($where: LiveRoomWhereInput!) {
            liveRooms(where: $where) {
              nodes {
                id
                players(where: { name: { equals: "Node Player" } }) {
                  nodes {
                    roomPlayerId
                    name
                    team
                    admin
                  }
                }
              }
            }
          }
        `,
        variables: {
          where: {
            id: { equals: fixture.roomId }
          }
        }
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        liveRooms: {
          nodes: [
            {
              id: fixture.roomId,
              players: {
                nodes: [
                  {
                    roomPlayerId: 7,
                    name: "Node Player",
                    team: "BLUE",
                    admin: true
                  }
                ]
              }
            }
          ]
        }
      }
    });
  });

  it("returns all native room enum values through GraphQL names", async () => {
    const stopped = await liveRoomWithSnapshot({
      room: { gameStatus: "stopped" },
      players: [{ team: "spectators", sessionKind: "guest" }]
    });
    const running = await liveRoomWithSnapshot({
      room: { gameStatus: "running" },
      players: [{ team: "red", sessionKind: "resolving" }]
    });
    const paused = await liveRoomWithSnapshot({
      room: { gameStatus: "paused" },
      players: [{ team: "blue", sessionKind: "signing-in" }]
    });
    const resuming = await liveRoomWithSnapshot({
      room: { gameStatus: "resuming" },
      players: [{ team: "red", sessionKind: "signed-in" }]
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Rooms($ids: [LiveRoomWhereInput!]!) {
            liveRooms(where: { OR: $ids }) {
              edges {
                node {
                  id
                  room {
                    gameStatus
                  }
                  players(first: 1) {
                    edges {
                      node {
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
        variables: {
          ids: [stopped, running, paused, resuming].map((room) => ({
            id: { equals: room.roomId }
          }))
        }
      }
    });

    const statuses = roomNodes<{
      room: { gameStatus: string };
      players: {
        edges: Array<{ node: { team: string; sessionKind: string } }>;
      };
    }>(await response.json()).map((room) => ({
      gameStatus: room.room.gameStatus,
      team: room.players.edges[0].node.team,
      sessionKind: room.players.edges[0].node.sessionKind
    }));

    expect(statuses).toEqual([
      { gameStatus: "STOPPED", team: "SPECTATORS", sessionKind: "GUEST" },
      { gameStatus: "RUNNING", team: "RED", sessionKind: "RESOLVING" },
      { gameStatus: "PAUSED", team: "BLUE", sessionKind: "SIGNING_IN" },
      { gameStatus: "RESUMING", team: "RED", sessionKind: "SIGNED_IN" }
    ]);
  });

  it("filters live rooms by exact ID", async () => {
    const fixture = await liveRoomWithSnapshot();
    await liveRoomWithSnapshot();

    const rooms = await queryLiveRoomIds({
      id: { equals: fixture.roomId }
    });

    expect(rooms).toEqual([fixture.roomId]);
  });

  it("filters live rooms by ID prefix", async () => {
    const fixture = await liveRoomWithSnapshot();

    const rooms = await queryLiveRoomIds({
      id: { startsWith: fixture.roomId.slice(0, 8) }
    });

    expect(rooms).toContain(fixture.roomId);
  });

  it("filters live rooms by ID substring", async () => {
    const fixture = await liveRoomWithSnapshot();

    const rooms = await queryLiveRoomIds({
      id: { contains: fixture.roomId.slice(9, 18) }
    });

    expect(rooms).toContain(fixture.roomId);
  });

  it("filters live rooms by connected state", async () => {
    const connected = await liveRoomWithSnapshot();
    const disconnected = await liveRoomWithSnapshot();

    await disconnectLiveRoomFixture(disconnected.roomId);

    const rooms = await queryLiveRoomIds({
      OR: [
        { id: { equals: connected.roomId } },
        { id: { equals: disconnected.roomId } }
      ],
      connected: { equals: true }
    });

    expect(rooms).toEqual([connected.roomId]);
  });

  it("keeps the last snapshot queryable after disconnect", async () => {
    const fixture = await liveRoomWithSnapshot({
      room: {
        name: "Last Known State"
      }
    });

    await disconnectLiveRoomFixture(fixture.roomId);

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              connected
              room {
                name
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom).toEqual({
      connected: false,
      room: {
        name: "Last Known State"
      }
    });
  });

  it("replaces the live room snapshot instead of merging stale players", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [{ name: "Old Player" }]
    });

    await publishLiveRoomSnapshot(fixture.roomId, {
      ...baseSnapshot(),
      revision: 2,
      players: [player(1, { name: "New Player", team: "blue" })]
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              revision
              players {
                edges {
                  node {
                    name
                    team
                  }
                }
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom).toEqual({
      revision: 2,
      players: {
        edges: [
          {
            node: {
              name: "New Player",
              team: "BLUE"
            }
          }
        ]
      }
    });
  });

  it("returns nullable native room fields", async () => {
    const fixture = await liveRoomWithSnapshot({
      room: {
        name: null,
        teamsLocked: null,
        scores: null
      }
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              room {
                name
                teamsLocked
                scores {
                  red
                  blue
                }
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom.room).toEqual({
      name: null,
      teamsLocked: null,
      scores: null
    });
  });

  it("combines live room filters with AND", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [{ name: "Anderson", team: "red" }]
    });

    const rooms = await queryLiveRoomIds({
      AND: [
        { id: { equals: fixture.roomId } },
        { players: { some: { name: { startsWith: "And" } } } }
      ]
    });

    expect(rooms).toEqual([fixture.roomId]);
  });

  it("combines live room filters with OR", async () => {
    const first = await liveRoomWithSnapshot({
      players: [{ name: "Orlando", team: "red" }]
    });
    const second = await liveRoomWithSnapshot({
      players: [{ name: "Olivia", team: "blue" }]
    });

    const rooms = await queryLiveRoomIds({
      OR: [
        { players: { some: { name: { equals: "Orlando" } } } },
        { players: { some: { name: { equals: "Olivia" } } } }
      ]
    });

    expect(rooms).toEqual([first.roomId, second.roomId]);
  });

  it("combines live room filters with NOT", async () => {
    const kept = await liveRoomWithSnapshot({
      players: [{ name: "Kept Player", team: "red" }]
    });
    const excluded = await liveRoomWithSnapshot({
      players: [{ name: "Excluded Player", team: "blue" }]
    });

    const rooms = await queryLiveRoomIds({
      OR: [
        { id: { equals: kept.roomId } },
        { id: { equals: excluded.roomId } }
      ],
      NOT: [{ players: { some: { name: { contains: "Excluded" } } } }]
    });

    expect(rooms).toEqual([kept.roomId]);
  });

  it("filters live rooms by players.some", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [{ name: "Exact Player", team: "blue" }]
    });

    const rooms = await queryLiveRoomIds({
      players: {
        some: {
          name: { equals: "Exact Player" },
          team: { equals: "blue" }
        }
      }
    });

    expect(rooms).toContain(fixture.roomId);
  });

  it("filters live rooms by players.every", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [
        { name: "Ready One", playable: true },
        { name: "Ready Two", playable: true }
      ]
    });
    const rejected = await liveRoomWithSnapshot({
      players: [
        { name: "Ready Three", playable: true },
        { name: "Blocked", playable: false }
      ]
    });

    const rooms = await queryLiveRoomIds({
      OR: [
        { id: { equals: fixture.roomId } },
        { id: { equals: rejected.roomId } }
      ],
      players: { every: { playable: { equals: true } } }
    });

    expect(rooms).toEqual([fixture.roomId]);
  });

  it("filters live rooms by players.none", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [{ name: "Synced", desynced: false }]
    });
    const rejected = await liveRoomWithSnapshot({
      players: [{ name: "Desynced", desynced: true }]
    });

    const rooms = await queryLiveRoomIds({
      OR: [
        { id: { equals: fixture.roomId } },
        { id: { equals: rejected.roomId } }
      ],
      players: { none: { desynced: { equals: true } } }
    });

    expect(rooms).toEqual([fixture.roomId]);
  });

  it("paginates live rooms after filtering", async () => {
    const first = await liveRoomWithSnapshot();
    const second = await liveRoomWithSnapshot();

    const firstPage = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Rooms($where: LiveRoomWhereInput!) {
            liveRooms(where: $where, first: 1) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                }
              }
            }
          }
        `,
        variables: {
          where: {
            OR: [
              { id: { equals: first.roomId } },
              { id: { equals: second.roomId } }
            ]
          }
        }
      }
    });
    const firstBody = await firstPage.json();

    expect(firstBody.data.liveRooms.edges).toEqual([
      { node: { id: first.roomId } }
    ]);
    expect(firstBody.data.liveRooms.pageInfo.hasNextPage).toBe(true);

    const secondPage = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Rooms($where: LiveRoomWhereInput!, $after: String!) {
            liveRooms(where: $where, first: 1, after: $after) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                }
              }
            }
          }
        `,
        variables: {
          where: {
            OR: [
              { id: { equals: first.roomId } },
              { id: { equals: second.roomId } }
            ]
          },
          after: firstBody.data.liveRooms.pageInfo.endCursor
        }
      }
    });

    expect((await secondPage.json()).data.liveRooms.edges).toEqual([
      { node: { id: second.roomId } }
    ]);
  });

  it("returns empty live room connections with empty page info", async () => {
    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Rooms($where: LiveRoomWhereInput!) {
            liveRooms(where: $where) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                }
              }
            }
          }
        `,
        variables: {
          where: {
            id: { equals: crypto.randomUUID() }
          }
        }
      }
    });

    expect((await response.json()).data.liveRooms).toEqual({
      pageInfo: {
        hasNextPage: false,
        endCursor: null
      },
      edges: []
    });
  });

  it("filters nested players by integer, string, and boolean fields", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [
        {
          roomPlayerId: 12,
          name: "Filtered Admin",
          team: "red",
          admin: true,
          avatar: "FA",
          desynced: false,
          sessionKind: "signed-in",
          playable: true,
          playBlockedReason: null
        },
        {
          roomPlayerId: 13,
          name: "Other Guest",
          team: "spectators",
          admin: false,
          desynced: true,
          sessionKind: "guest",
          playable: false,
          playBlockedReason: "not registered"
        }
      ]
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              players(
                where: {
                  roomPlayerId: { equals: 12 }
                  name: { contains: "Admin" }
                  team: { equals: "red" }
                  admin: { equals: true }
                  desynced: { equals: false }
                  sessionKind: { equals: "signed-in" }
                  playable: { equals: true }
                }
              ) {
                edges {
                  node {
                    roomPlayerId
                    name
                    avatar
                    playBlockedReason
                  }
                }
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom.players.edges).toEqual([
      {
        node: {
          roomPlayerId: 12,
          name: "Filtered Admin",
          avatar: "FA",
          playBlockedReason: null
        }
      }
    ]);
  });

  it("combines nested player filters with AND, OR, and NOT", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [
        { name: "Alpha", team: "red", playable: true },
        { name: "Beta", team: "blue", playable: true },
        { name: "Gamma", team: "blue", playable: false }
      ]
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              players(
                where: {
                  AND: [{ playable: { equals: true } }]
                  OR: [
                    { name: { equals: "Alpha" } }
                    { team: { equals: "blue" } }
                  ]
                  NOT: [{ name: { equals: "Gamma" } }]
                }
              ) {
                edges {
                  node {
                    name
                  }
                }
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom.players.edges).toEqual([
      { node: { name: "Alpha" } },
      { node: { name: "Beta" } }
    ]);
  });

  it("paginates nested players", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [
        { name: "Player One" },
        { name: "Player Two" },
        { name: "Player Three" }
      ]
    });

    const firstPage = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              players(first: 2) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  node {
                    name
                  }
                }
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });
    const firstBody = await firstPage.json();

    expect(firstBody.data.liveRoom.players.edges).toEqual([
      { node: { name: "Player One" } },
      { node: { name: "Player Two" } }
    ]);
    expect(firstBody.data.liveRoom.players.pageInfo.hasNextPage).toBe(true);

    const secondPage = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!, $after: String!) {
            liveRoom(id: $id) {
              players(first: 2, after: $after) {
                pageInfo {
                  hasNextPage
                }
                edges {
                  node {
                    name
                  }
                }
              }
            }
          }
        `,
        variables: {
          id: fixture.roomId,
          after: firstBody.data.liveRoom.players.pageInfo.endCursor
        }
      }
    });

    expect((await secondPage.json()).data.liveRoom.players).toEqual({
      pageInfo: {
        hasNextPage: false
      },
      edges: [{ node: { name: "Player Three" } }]
    });
  });

  it("coerces nested player page size into the supported bounds", async () => {
    const fixture = await liveRoomWithSnapshot({
      players: [{ name: "First" }, { name: "Second" }]
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              players(first: 0) {
                pageInfo {
                  hasNextPage
                }
                edges {
                  node {
                    name
                  }
                }
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom.players).toEqual({
      pageInfo: {
        hasNextPage: true
      },
      edges: [{ node: { name: "First" } }]
    });
  });

  it("publishes contract state documents and derived facts", async () => {
    const fixture = await liveRoomWithSnapshot({
      contract,
      documents: [
        {
          name: "match",
          version: 1,
          payload: {
            phase: "drive",
            down: 3,
            clockRunning: true,
            quarterback: "Gabriel"
          }
        }
      ]
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              stateDocuments {
                namespace
                name
                version
                revision
                payload
              }
              stateFacts {
                namespace
                key
                type
                stringValue
                numberValue
                booleanValue
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom).toMatchObject({
      stateDocuments: [
        {
          namespace: "haxfootball",
          name: "match",
          version: 1,
          revision: 1,
          payload: {
            phase: "drive",
            down: 3,
            clockRunning: true,
            quarterback: "Gabriel"
          }
        }
      ],
      stateFacts: [
        {
          namespace: "haxfootball",
          key: "phase",
          type: "STRING",
          stringValue: "drive",
          numberValue: null,
          booleanValue: null
        },
        {
          namespace: "haxfootball",
          key: "down",
          type: "NUMBER",
          stringValue: null,
          numberValue: 3,
          booleanValue: null
        },
        {
          namespace: "haxfootball",
          key: "clock-running",
          type: "BOOLEAN",
          stringValue: null,
          numberValue: null,
          booleanValue: true
        },
        {
          namespace: "haxfootball",
          key: "quarterback",
          type: "STRING",
          stringValue: "Gabriel",
          numberValue: null,
          booleanValue: null
        }
      ]
    });
  });

  it("omits facts whose pointers are missing or whose runtime type does not match", async () => {
    const fixture = await liveRoomWithSnapshot({
      contract: {
        namespace: "haxfootball",
        documents: [
          {
            name: "match",
            version: 1,
            schema: {
              type: "object",
              required: ["phase"],
              properties: {
                phase: { type: "string" }
              }
            }
          }
        ],
        facts: [
          {
            key: "phase",
            type: "string",
            document: "match",
            pointer: "/phase"
          },
          {
            key: "missing",
            type: "string",
            document: "match",
            pointer: "/missing"
          },
          {
            key: "wrong-type",
            type: "number",
            document: "match",
            pointer: "/phase"
          }
        ]
      },
      documents: [
        {
          name: "match",
          version: 1,
          payload: {
            phase: "drive"
          }
        }
      ]
    });

    const facts = await queryStateFacts(fixture.roomId, {
      namespace: { equals: "haxfootball" }
    });

    expect(facts).toEqual([{ key: "phase", stringValue: "drive" }]);
  });

  it("publishes multiple contract documents in one snapshot", async () => {
    const fixture = await liveRoomWithSnapshot({
      contract: {
        namespace: "haxfootball",
        documents: [
          {
            name: "match",
            version: 1,
            schema: {
              type: "object",
              required: ["phase"],
              properties: {
                phase: { type: "string" }
              }
            }
          },
          {
            name: "scoreboard",
            version: 1,
            schema: {
              type: "object",
              required: ["red"],
              properties: {
                red: { type: "number" }
              }
            }
          }
        ],
        facts: [
          {
            key: "phase",
            type: "string",
            document: "match",
            pointer: "/phase"
          },
          {
            key: "red-score",
            type: "number",
            document: "scoreboard",
            pointer: "/red"
          }
        ]
      },
      documents: [
        {
          name: "match",
          version: 1,
          payload: {
            phase: "halftime"
          }
        },
        {
          name: "scoreboard",
          version: 1,
          payload: {
            red: 28
          }
        }
      ]
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              stateDocuments {
                name
              }
              stateFacts {
                key
                stringValue
                numberValue
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom).toEqual({
      stateDocuments: [{ name: "match" }, { name: "scoreboard" }],
      stateFacts: [
        {
          key: "phase",
          stringValue: "halftime",
          numberValue: null
        },
        {
          key: "red-score",
          stringValue: null,
          numberValue: 28
        }
      ]
    });
  });

  it("filters state documents by namespace, name, and version", async () => {
    const fixture = await liveRoomWithContractState();

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              stateDocuments(
                where: {
                  namespace: { equals: "haxfootball" }
                  name: { equals: "match" }
                  version: { equals: 1 }
                }
              ) {
                name
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom.stateDocuments).toEqual([
      { name: "match" }
    ]);
  });

  it("combines state document filters with logical operators", async () => {
    const fixture = await liveRoomWithContractState();

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Room($id: ID!) {
            liveRoom(id: $id) {
              stateDocuments(
                where: {
                  AND: [{ namespace: { startsWith: "hax" } }]
                  OR: [{ name: { equals: "match" } }]
                  NOT: [{ version: { equals: 2 } }]
                }
              ) {
                name
              }
            }
          }
        `,
        variables: { id: fixture.roomId }
      }
    });

    expect((await response.json()).data.liveRoom.stateDocuments).toEqual([
      { name: "match" }
    ]);
  });

  it("filters live rooms by state document relation", async () => {
    const fixture = await liveRoomWithContractState();
    const rejected = await liveRoomWithSnapshot();

    const rooms = await queryLiveRoomIds({
      OR: [
        { id: { equals: fixture.roomId } },
        { id: { equals: rejected.roomId } }
      ],
      stateDocuments: {
        some: { name: { equals: "match" } }
      }
    });

    expect(rooms).toEqual([fixture.roomId]);
  });

  it("filters live rooms by state document every and none relations", async () => {
    const fixture = await liveRoomWithContractState();
    const rejected = await liveRoomWithSnapshot({
      contract,
      documents: [
        {
          name: "match",
          version: 1,
          payload: {
            phase: "kickoff",
            down: 1,
            clockRunning: true,
            quarterback: "Other"
          }
        }
      ]
    });

    const rooms = await queryLiveRoomIds({
      OR: [
        { id: { equals: fixture.roomId } },
        { id: { equals: rejected.roomId } }
      ],
      stateDocuments: {
        every: { namespace: { equals: "haxfootball" } },
        none: { name: { equals: "missing" } }
      },
      stateFacts: {
        some: {
          key: { equals: "quarterback" },
          stringValue: { equals: "Gabriel" }
        }
      }
    });

    expect(rooms).toEqual([fixture.roomId]);
  });

  it("filters state facts by string values", async () => {
    const fixture = await liveRoomWithContractState();

    const facts = await queryStateFacts(fixture.roomId, {
      key: { equals: "quarterback" },
      stringValue: { equals: "Gabriel" }
    });

    expect(facts).toEqual([{ key: "quarterback", stringValue: "Gabriel" }]);
  });

  it("filters state facts by number values", async () => {
    const fixture = await liveRoomWithContractState();

    const facts = await queryStateFacts(fixture.roomId, {
      key: { equals: "down" },
      numberValue: { equals: 2 }
    });

    expect(facts).toEqual([{ key: "down", numberValue: 2 }]);
  });

  it("filters state facts by boolean values", async () => {
    const fixture = await liveRoomWithContractState();

    const facts = await queryStateFacts(fixture.roomId, {
      key: { equals: "clock-running" },
      booleanValue: { equals: false }
    });

    expect(facts).toEqual([{ key: "clock-running", booleanValue: false }]);
  });

  it("combines state fact filters with logical operators", async () => {
    const fixture = await liveRoomWithContractState();

    const facts = await queryStateFacts(fixture.roomId, {
      AND: [{ namespace: { equals: "haxfootball" } }],
      OR: [{ type: { equals: "string" } }, { type: { equals: "number" } }],
      NOT: [{ key: { equals: "phase" } }]
    });

    expect(facts).toEqual([
      { key: "down", numberValue: 2 },
      { key: "quarterback", stringValue: "Gabriel" }
    ]);
  });

  it("filters live rooms by state fact relation", async () => {
    const fixture = await liveRoomWithContractState();
    const rejected = await liveRoomWithSnapshot();

    const rooms = await queryLiveRoomIds({
      OR: [
        { id: { equals: fixture.roomId } },
        { id: { equals: rejected.roomId } }
      ],
      stateFacts: {
        some: {
          key: { equals: "down" },
          numberValue: { equals: 2 }
        }
      }
    });

    expect(rooms).toEqual([fixture.roomId]);
  });

  it("filters live rooms by state fact every and none relations", async () => {
    const fixture = await liveRoomWithContractState();
    const rejected = await liveRoomWithSnapshot({
      contract,
      documents: [
        {
          name: "match",
          version: 1,
          payload: {
            phase: "drive",
            down: 4,
            clockRunning: false,
            quarterback: "Gabriel"
          }
        }
      ]
    });

    const rooms = await queryLiveRoomIds({
      OR: [
        { id: { equals: fixture.roomId } },
        { id: { equals: rejected.roomId } }
      ],
      stateFacts: {
        every: { namespace: { equals: "haxfootball" } },
        none: {
          key: { equals: "down" },
          numberValue: { equals: 4 }
        }
      }
    });

    expect(rooms).toEqual([fixture.roomId]);
  });

  it("rejects unknown contract documents", async () => {
    const fixture = await createLiveRoomFixture({
      liveStateContract: contract
    });

    await connectLiveRoomFixture({ roomId: fixture.roomId });

    expect(
      publishLiveRoomSnapshot(fixture.roomId, {
        ...baseSnapshot(),
        stateDocuments: [
          {
            name: "unknown",
            version: 1,
            payload: {}
          }
        ]
      })
    ).rejects.toThrow("Unknown live state document 'unknown'");
  });

  it("rejects invalid contract document versions", async () => {
    const fixture = await createLiveRoomFixture({
      liveStateContract: contract
    });

    await connectLiveRoomFixture({ roomId: fixture.roomId });

    expect(
      publishLiveRoomSnapshot(fixture.roomId, {
        ...baseSnapshot(),
        stateDocuments: [
          {
            name: "match",
            version: 2,
            payload: {}
          }
        ]
      })
    ).rejects.toThrow("Invalid live state document version 'match'");
  });

  it("rejects invalid contract document payloads", async () => {
    const fixture = await createLiveRoomFixture({
      liveStateContract: contract
    });

    await connectLiveRoomFixture({ roomId: fixture.roomId });

    expect(
      publishLiveRoomSnapshot(fixture.roomId, {
        ...baseSnapshot(),
        stateDocuments: [
          {
            name: "match",
            version: 1,
            payload: {
              phase: "drive",
              down: "second",
              clockRunning: true,
              quarterback: "Gabriel"
            }
          }
        ]
      })
    ).rejects.toThrow("Invalid live state document payload 'match'");
  });
});

describe("live state GraphQL commands", () => {
  it("queues commands for a room without a live control connection", async () => {
    const fixture = await createLiveRoomFixture();

    const command = await enqueueCommand(fixture.roomId, "ping", {
      nonce: "queued"
    });

    expect(command).toMatchObject({
      roomId: fixture.roomId,
      name: "ping",
      payload: { nonce: "queued" },
      status: "QUEUED",
      sentAt: null
    });
  });

  it("returns live room command connection nodes", async () => {
    const fixture = await createLiveRoomFixture();
    const command = await enqueueCommand(fixture.roomId, "ping", {
      nonce: "nodes"
    });

    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Commands($roomId: ID!) {
            liveRoomCommands(roomId: $roomId) {
              nodes {
                id
                roomId
                name
                payload
                status
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
        liveRoomCommands: {
          nodes: [
            {
              id: command.id,
              roomId: fixture.roomId,
              name: "ping",
              payload: { nonce: "nodes" },
              status: "QUEUED"
            }
          ]
        }
      }
    });
  });

  it("rejects commands for terminal rooms", async () => {
    const closed = await createLiveRoomFixture({ state: "closed" });
    const failed = await createLiveRoomFixture({ state: "failed" });

    for (const fixture of [closed, failed]) {
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
              roomId: fixture.roomId,
              name: "ping",
              payload: null
            }
          }
        }
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.errors[0].message).toContain(
        "Live room commands are not available for terminal rooms"
      );
      expect(body.errors[0].extensions).toMatchObject({
        code: "BAD_REQUEST"
      });
    }
  });

  it("allows commands for provisioning rooms", async () => {
    const fixture = await createLiveRoomFixture({ state: "provisioning" });

    const command = await enqueueCommand(fixture.roomId, "ping", {
      nonce: "provisioning"
    });

    expect(command).toMatchObject({
      roomId: fixture.roomId,
      status: "QUEUED"
    });
  });

  it("delivers queued commands when the room connects", async () => {
    const fixture = await createLiveRoomFixture();
    const deliveredMessages: unknown[] = [];
    const queued = await enqueueCommand(fixture.roomId, "ping", {
      nonce: "before-connect"
    });

    await connectLiveRoomFixture({
      roomId: fixture.roomId,
      deliveredMessages
    });

    expect(deliveredMessages).toEqual([
      {
        type: "api.command",
        command: expect.objectContaining({
          id: queued.id,
          roomId: fixture.roomId,
          name: "ping",
          payload: { nonce: "before-connect" }
        })
      }
    ]);

    const commands = await listCommands(fixture.roomId, "SENT");

    expect(commands).toMatchObject([
      {
        id: queued.id,
        status: "SENT",
        sentAt: expect.any(String)
      }
    ]);
  });

  it("delivers queued commands in creation order when the room connects", async () => {
    const fixture = await createLiveRoomFixture();
    const deliveredMessages: unknown[] = [];
    const first = await enqueueCommand(fixture.roomId, "ping", { index: 1 });
    const second = await enqueueCommand(fixture.roomId, "ping", { index: 2 });
    const third = await enqueueCommand(fixture.roomId, "ping", { index: 3 });

    await connectLiveRoomFixture({
      roomId: fixture.roomId,
      deliveredMessages
    });

    expect(commandIds(deliveredMessages)).toEqual([
      first.id,
      second.id,
      third.id
    ]);
  });

  it("redelivers sent commands when a room reconnects before acknowledgment", async () => {
    const fixture = await createLiveRoomFixture();
    const firstConnectionMessages: unknown[] = [];
    const secondConnectionMessages: unknown[] = [];
    const command = await enqueueCommand(fixture.roomId, "ping", {
      nonce: "redeliver"
    });

    await connectLiveRoomFixture({
      roomId: fixture.roomId,
      deliveredMessages: firstConnectionMessages
    });
    await connectLiveRoomFixture({
      roomId: fixture.roomId,
      deliveredMessages: secondConnectionMessages
    });

    expect(commandIds(firstConnectionMessages)).toEqual([command.id]);
    expect(commandIds(secondConnectionMessages)).toEqual([command.id]);
    expect(await listCommands(fixture.roomId, "SENT")).toMatchObject([
      {
        id: command.id,
        status: "SENT"
      }
    ]);
  });

  it("acknowledges successful command results", async () => {
    const fixture = await createLiveRoomFixture();

    await connectLiveRoomFixture({ roomId: fixture.roomId });

    const command = await enqueueCommand(fixture.roomId, "ping", {
      nonce: "ack"
    });

    await acknowledgeLiveRoomCommand({
      commandId: command.id,
      result: { ok: true }
    });

    expect(await listCommands(fixture.roomId, "ACKNOWLEDGED")).toMatchObject([
      {
        id: command.id,
        status: "ACKNOWLEDGED",
        result: { ok: true },
        error: null,
        completedAt: expect.any(String)
      }
    ]);
  });

  it("does not allow command completion before delivery", async () => {
    const fixture = await createLiveRoomFixture();
    const command = await enqueueCommand(fixture.roomId, "ping", {
      nonce: "queued-completion"
    });

    await expect(
      acknowledgeLiveRoomCommand({
        commandId: command.id,
        result: { ok: true }
      })
    ).rejects.toThrow("Live room command is not awaiting completion");
  });

  it("does not allow completed commands to be completed again", async () => {
    const fixture = await createLiveRoomFixture();

    await connectLiveRoomFixture({ roomId: fixture.roomId });

    const command = await enqueueCommand(fixture.roomId, "ping", {
      nonce: "single-shot"
    });

    await acknowledgeLiveRoomCommand({
      commandId: command.id,
      result: { ok: true }
    });

    await expect(
      acknowledgeLiveRoomCommand({
        commandId: command.id,
        ok: false,
        result: null,
        error: "too late"
      })
    ).rejects.toThrow("Live room command is not awaiting completion");
  });

  it("records failed command results", async () => {
    const fixture = await createLiveRoomFixture();

    await connectLiveRoomFixture({ roomId: fixture.roomId });

    const command = await enqueueCommand(fixture.roomId, "ping", {
      nonce: "fail"
    });

    await acknowledgeLiveRoomCommand({
      commandId: command.id,
      ok: false,
      result: null,
      error: "Room rejected command"
    });

    expect(await listCommands(fixture.roomId, "FAILED")).toMatchObject([
      {
        id: command.id,
        status: "FAILED",
        result: null,
        error: "Room rejected command",
        completedAt: expect.any(String)
      }
    ]);
  });

  it("filters commands by status", async () => {
    const queuedFixture = await createLiveRoomFixture();
    const sentFixture = await createLiveRoomFixture();
    const queued = await enqueueCommand(queuedFixture.roomId, "ping", {
      nonce: "queued"
    });

    await connectLiveRoomFixture({ roomId: sentFixture.roomId });

    const sent = await enqueueCommand(sentFixture.roomId, "ping", {
      nonce: "sent"
    });

    expect(await listCommands(queuedFixture.roomId, "QUEUED")).toMatchObject([
      {
        id: queued.id,
        status: "QUEUED"
      }
    ]);
    expect(await listCommands(sentFixture.roomId, "SENT")).toMatchObject([
      {
        id: sent.id,
        status: "SENT"
      }
    ]);
  });

  it("paginates room commands", async () => {
    const fixture = await createLiveRoomFixture();

    const first = await enqueueCommand(fixture.roomId, "ping", { index: 1 });
    const second = await enqueueCommand(fixture.roomId, "ping", { index: 2 });

    const firstPage = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Commands($roomId: ID!) {
            liveRoomCommands(roomId: $roomId, first: 1) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                }
              }
            }
          }
        `,
        variables: { roomId: fixture.roomId }
      }
    });
    const firstBody = await firstPage.json();

    expect(firstBody.data.liveRoomCommands.edges).toEqual([
      { node: { id: first.id } }
    ]);
    expect(firstBody.data.liveRoomCommands.pageInfo.hasNextPage).toBe(true);

    const secondPage = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Commands($roomId: ID!, $after: String!) {
            liveRoomCommands(roomId: $roomId, first: 1, after: $after) {
              pageInfo {
                hasNextPage
              }
              edges {
                node {
                  id
                }
              }
            }
          }
        `,
        variables: {
          roomId: fixture.roomId,
          after: firstBody.data.liveRoomCommands.pageInfo.endCursor
        }
      }
    });

    expect((await secondPage.json()).data.liveRoomCommands).toEqual({
      pageInfo: {
        hasNextPage: false
      },
      edges: [{ node: { id: second.id } }]
    });
  });

  it("rejects invalid command names", async () => {
    const fixture = await createLiveRoomFixture();
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
            roomId: fixture.roomId,
            name: "Invalid Name",
            payload: null
          }
        }
      }
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors[0].message).toContain(
      "Live room command name is invalid"
    );
    expect(body.errors[0].extensions).toMatchObject({
      code: "BAD_REQUEST"
    });
  });

  it("returns a domain error when enqueueing a command for an unknown room", async () => {
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
            roomId: crypto.randomUUID(),
            name: "ping",
            payload: null
          }
        }
      }
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.errors[0].message).toContain("Room not found");
    expect(body.errors[0].extensions).toMatchObject({
      code: "NOT_FOUND"
    });
  });

  it("returns a domain error when listing commands for an unknown room", async () => {
    const response = await request("/api/graphql", {
      method: "POST",
      body: {
        query: `
          query Commands($roomId: ID!) {
            liveRoomCommands(roomId: $roomId) {
              edges {
                node {
                  id
                }
              }
            }
          }
        `,
        variables: { roomId: crypto.randomUUID() }
      }
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.errors[0].message).toContain("Room not found");
    expect(body.errors[0].extensions).toMatchObject({
      code: "NOT_FOUND"
    });
  });
});

async function liveRoomWithContractState(): Promise<LiveRoomFixture> {
  return liveRoomWithSnapshot({
    contract,
    documents: [
      {
        name: "match",
        version: 1,
        payload: {
          phase: "drive",
          down: 2,
          clockRunning: false,
          quarterback: "Gabriel"
        }
      }
    ]
  });
}

async function liveRoomWithSnapshot(input?: {
  contract?: RoomProgramLiveStateContract;
  room?: Partial<LiveRoomSnapshot["room"]>;
  players?: Array<Partial<LivePlayer>>;
  documents?: LiveRoomSnapshot["stateDocuments"];
}): Promise<LiveRoomFixture> {
  const fixture = await createLiveRoomFixture({
    liveStateContract: input?.contract ?? null
  });

  await connectLiveRoomFixture({ roomId: fixture.roomId });
  await publishLiveRoomSnapshot(fixture.roomId, {
    ...baseSnapshot(),
    room: {
      ...baseSnapshot().room,
      ...input?.room
    },
    players: input?.players?.map((item, index) => player(index + 1, item)) ?? [
      player(1)
    ],
    stateDocuments: input?.documents ?? []
  });

  return fixture;
}

function baseSnapshot(): LiveRoomSnapshot {
  return {
    revision: 1,
    room: {
      name: "GraphQL E2E Room",
      teamsLocked: false,
      gameStatus: "running",
      scores: {
        red: 0,
        blue: 0
      }
    },
    players: [player(1)],
    stateDocuments: []
  };
}

function player(
  index: number,
  overrides: Partial<LivePlayer> = {}
): LivePlayer {
  return {
    roomPlayerId: overrides.roomPlayerId ?? index,
    name: overrides.name ?? `Player ${index}`,
    team: overrides.team ?? "red",
    admin: overrides.admin ?? false,
    avatar: overrides.avatar ?? null,
    desynced: overrides.desynced ?? false,
    sessionKind: overrides.sessionKind ?? "guest",
    playable: overrides.playable ?? true,
    playBlockedReason: overrides.playBlockedReason ?? null
  };
}

async function queryLiveRoomIds(where: unknown): Promise<string[]> {
  const response = await request("/api/graphql", {
    method: "POST",
    body: {
      query: `
        query Rooms($where: LiveRoomWhereInput!) {
          liveRooms(where: $where) {
            edges {
              node {
                id
              }
            }
          }
        }
      `,
      variables: { where }
    }
  });

  return roomNodes<{ id: string }>(await response.json()).map(
    (room) => room.id
  );
}

async function queryStateFacts(
  roomId: string,
  where: unknown
): Promise<Array<Record<string, unknown>>> {
  const response = await request("/api/graphql", {
    method: "POST",
    body: {
      query: `
        query Room($id: ID!, $where: LiveStateFactWhereInput!) {
          liveRoom(id: $id) {
            stateFacts(where: $where) {
              key
              stringValue
              numberValue
              booleanValue
            }
          }
        }
      `,
      variables: { id: roomId, where }
    }
  });

  return (await response.json()).data.liveRoom.stateFacts.map(
    (fact: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(fact).filter((entry) => entry[1] !== null)
      )
  );
}

async function enqueueCommand(
  roomId: string,
  name: string,
  payload: unknown
): Promise<{ id: string } & Record<string, unknown>> {
  const response = await request("/api/graphql", {
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
            result
            error
            sentAt
            completedAt
          }
        }
      `,
      variables: {
        input: {
          roomId,
          name,
          payload
        }
      }
    }
  });

  return (await response.json()).data.enqueueLiveRoomCommand;
}

async function listCommands(
  roomId: string,
  status: string
): Promise<Array<Record<string, unknown>>> {
  const response = await request("/api/graphql", {
    method: "POST",
    body: {
      query: `
        query Commands($roomId: ID!, $status: LiveRoomCommandStatus!) {
          liveRoomCommands(roomId: $roomId, status: $status) {
            edges {
              node {
                id
                status
                result
                error
                sentAt
                completedAt
              }
            }
          }
        }
      `,
      variables: { roomId, status }
    }
  });

  return (await response.json()).data.liveRoomCommands.edges.map(
    (edge: { node: Record<string, unknown> }) => edge.node
  );
}

function roomNodes<TNode>(body: {
  data: { liveRooms: { edges: Array<{ node: TNode }> } };
}): TNode[] {
  return body.data.liveRooms.edges.map((edge) => edge.node);
}

function commandIds(messages: unknown[]): unknown[] {
  return messages.map(
    (message) => (message as { command: { id: unknown } }).command.id
  );
}
