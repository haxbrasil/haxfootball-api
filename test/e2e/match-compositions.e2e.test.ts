import { describe, expect, it } from "bun:test";
import { MATCH_ROOM_EVENT } from "@/test/e2e/helpers/events";
import { headlessAvatarEmojiRecordingFile } from "@/test/e2e/fixtures/recording";
import {
  paginatedBody,
  paginatedItems,
  request
} from "@/test/e2e/helpers/helpers";

type MatchScore = {
  red: number;
  blue: number;
};

type RecordingResponse = {
  id: string;
  url: string;
};

type GameModeResponse = {
  id: string;
  name: string;
};

type EventSchemaResponse = {
  id: string;
  name: string;
  version: number;
};

type PlayerResponse = {
  id: string;
};

type PhysicalMatchResponse = {
  kind: "single";
  id: string;
  status: "ongoing" | "completed";
  initiatedAt: string | null;
  endedAt: string | null;
  score: MatchScore | null;
  recording: RecordingResponse | null;
  gameMode: GameModeResponse | null;
  eventSchema: { id: string; version: number } | null;
  createdAt: string;
  updatedAt: string;
};

type RoundReference =
  | { kind: "sequential"; number: number; matchId: string }
  | { kind: "extra-time"; number: null; matchId: string };

type ComposedMatchResponse = {
  kind: "composed";
  id: string;
  status: "ongoing" | "completed";
  initiatedAt: string | null;
  endedAt: string | null;
  score: MatchScore | null;
  gameMode: GameModeResponse | null;
  eventSchema: { id: string; version: number } | null;
  rounds: Array<
    RoundReference & {
      match: PhysicalMatchResponse;
    }
  >;
  createdAt: string;
  updatedAt: string;
};

describe("match compositions", () => {
  it("creates a composed match with inherited metadata, final score, and extra time", async () => {
    const modeResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: `composition-happy-${crypto.randomUUID().slice(0, 8)}`,
        rank: 0
      }
    });

    expect(modeResponse.status).toBe(201);

    const mode: GameModeResponse = await modeResponse.json();
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: `composition-happy-${crypto.randomUUID().slice(0, 8)}`,
        definition: {
          events: [
            {
              type: "points",
              valueSchema: { type: "number" },
              aggregations: [
                {
                  target: "actor",
                  metric: "points",
                  initial: 0,
                  step: {
                    op: "add",
                    args: [{ path: "acc" }, { path: "event.value" }]
                  }
                }
              ]
            }
          ],
          metrics: [{ key: "points", label: "metric.points" }]
        }
      }
    });

    expect(schemaResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-01T18:00:00.000Z",
        endedAt: "2026-07-01T18:15:00.000Z",
        score: { red: 2, blue: 1 },
        gameMode: { name: mode.name },
        eventSchema: { id: schema.id, version: schema.version }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-01T18:17:00.000Z",
        endedAt: "2026-07-01T18:32:00.000Z",
        score: { red: 3, blue: 2 },
        gameMode: { name: mode.name },
        eventSchema: { id: schema.id, version: schema.version }
      }
    });
    const extraTimeResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-01T18:34:00.000Z",
        endedAt: "2026-07-01T18:42:00.000Z",
        score: { red: 4, blue: 3 },
        gameMode: { name: mode.name },
        eventSchema: { id: schema.id, version: schema.version }
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(extraTimeResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const extraTime: PhysicalMatchResponse = await extraTimeResponse.json();
    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id },
          { kind: "extra-time", number: null, matchId: extraTime.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const composition: ComposedMatchResponse = await compositionResponse.json();

    expect(composition).toMatchObject({
      kind: "composed",
      id: expect.stringMatching(/^c[a-z2-9]{8}$/),
      status: "completed",
      initiatedAt: first.initiatedAt,
      endedAt: extraTime.endedAt,
      score: extraTime.score,
      gameMode: { id: mode.id, name: mode.name },
      eventSchema: { id: schema.id, version: schema.version },
      createdAt: first.createdAt,
      updatedAt: expect.any(String),
      rounds: [
        {
          kind: "sequential",
          number: 1,
          matchId: first.id,
          match: { id: first.id, score: first.score, recording: null }
        },
        {
          kind: "sequential",
          number: 2,
          matchId: second.id,
          match: { id: second.id, score: second.score, recording: null }
        },
        {
          kind: "extra-time",
          number: null,
          matchId: extraTime.id,
          match: {
            id: extraTime.id,
            score: extraTime.score,
            recording: null
          }
        }
      ]
    });
    expect(composition.id).not.toBe(first.id);
    expect(composition.id).not.toBe(second.id);
    expect(composition.id).not.toBe(extraTime.id);
    expect(composition).not.toHaveProperty("recording");
    expect(composition).not.toHaveProperty("events");
    expect(composition).not.toHaveProperty("participations");
  });

  it("lists and filters one logical match at the first round cursor position", async () => {
    const modeResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: `composition-page-${crypto.randomUUID().slice(0, 8)}`,
        rank: 0
      }
    });

    expect(modeResponse.status).toBe(201);

    const mode: GameModeResponse = await modeResponse.json();
    const beforeResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-02T10:00:00.000Z",
        endedAt: "2026-07-02T10:05:00.000Z",
        score: { red: 0, blue: 0 },
        gameMode: { name: mode.name }
      }
    });
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-02T10:10:00.000Z",
        endedAt: "2026-07-02T10:15:00.000Z",
        score: { red: 1, blue: 0 },
        gameMode: { name: mode.name }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-02T10:20:00.000Z",
        endedAt: "2026-07-02T10:25:00.000Z",
        score: { red: 2, blue: 1 },
        gameMode: { name: mode.name }
      }
    });
    const afterResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-02T10:30:00.000Z",
        endedAt: "2026-07-02T10:35:00.000Z",
        score: { red: 3, blue: 1 },
        gameMode: { name: mode.name }
      }
    });

    expect(beforeResponse.status).toBe(201);
    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(afterResponse.status).toBe(201);

    const before: PhysicalMatchResponse = await beforeResponse.json();
    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const after: PhysicalMatchResponse = await afterResponse.json();
    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const composition: ComposedMatchResponse = await compositionResponse.json();
    const firstPageResponse = await request(
      `/api/matches?gameMode=${mode.name}&limit=2`
    );

    expect(firstPageResponse.status).toBe(200);

    const firstPage = await paginatedBody<
      PhysicalMatchResponse | ComposedMatchResponse
    >(firstPageResponse);

    expect(firstPage.items.map((match) => match.id)).toEqual([
      after.id,
      composition.id
    ]);
    expect(firstPage.items.map((match) => match.id)).not.toContain(first.id);
    expect(firstPage.items.map((match) => match.id)).not.toContain(second.id);
    expect(firstPage.page.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await request(
      `/api/matches?gameMode=${mode.name}&limit=2&cursor=${firstPage.page.nextCursor}`
    );
    const secondPage = await paginatedBody<
      PhysicalMatchResponse | ComposedMatchResponse
    >(secondPageResponse);

    expect(secondPage.items.map((match) => match.id)).toEqual([before.id]);
  });

  it("resolves child IDs to the composition and exposes explicit round details", async () => {
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-03T10:00:00.000Z",
        endedAt: "2026-07-03T10:10:00.000Z",
        score: { red: 1, blue: 0 }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-03T10:11:00.000Z",
        endedAt: "2026-07-03T10:20:00.000Z",
        score: { red: 2, blue: 0 }
      }
    });
    const extraTimeResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-03T10:21:00.000Z",
        endedAt: "2026-07-03T10:30:00.000Z",
        score: { red: 3, blue: 0 }
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(extraTimeResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const extraTime: PhysicalMatchResponse = await extraTimeResponse.json();
    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id },
          { kind: "extra-time", number: null, matchId: extraTime.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const composition: ComposedMatchResponse = await compositionResponse.json();

    const compositionGetResponse = await request(
      `/api/matches/${composition.id}`
    );
    const firstRoundAliasResponse = await request(`/api/matches/${first.id}`);
    const secondRoundAliasResponse = await request(`/api/matches/${second.id}`);
    const extraTimeAliasResponse = await request(
      `/api/matches/${extraTime.id}`
    );

    expect(compositionGetResponse.status).toBe(200);
    expect(await compositionGetResponse.json()).toEqual(composition);
    expect(firstRoundAliasResponse.status).toBe(200);
    expect(await firstRoundAliasResponse.json()).toEqual(composition);
    expect(secondRoundAliasResponse.status).toBe(200);
    expect(await secondRoundAliasResponse.json()).toEqual(composition);
    expect(extraTimeAliasResponse.status).toBe(200);
    expect(await extraTimeAliasResponse.json()).toEqual(composition);

    const secondRoundResponse = await request(
      `/api/matches/${composition.id}/rounds/2`
    );
    const extraTimeRoundResponse = await request(
      `/api/matches/${composition.id}/extra-time`
    );

    expect(secondRoundResponse.status).toBe(200);
    expect(await secondRoundResponse.json()).toMatchObject({
      kind: "sequential",
      number: 2,
      matchId: second.id,
      match: { id: second.id, events: [], participations: [] }
    });
    expect(extraTimeRoundResponse.status).toBe(200);
    expect(await extraTimeRoundResponse.json()).toMatchObject({
      kind: "extra-time",
      number: null,
      matchId: extraTime.id,
      match: { id: extraTime.id, events: [], participations: [] }
    });
  });

  it("paginates round-aware events and returns overall and per-round metrics", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: `composition-events-${crypto.randomUUID().slice(0, 8)}`,
        definition: {
          events: [
            {
              type: "points",
              valueSchema: { type: "number" },
              aggregations: [
                {
                  target: "actor",
                  metric: "points",
                  initial: 0,
                  step: {
                    op: "add",
                    args: [{ path: "acc" }, { path: "event.value" }]
                  }
                }
              ]
            }
          ],
          metrics: [{ key: "points", label: "metric.points" }]
        }
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `composition-events-${crypto.randomUUID()}`,
        name: `Player ${crypto.randomUUID().slice(0, 8)}`
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-04T10:00:00.000Z",
        endedAt: "2026-07-04T10:10:00.000Z",
        score: { red: 1, blue: 0 },
        eventSchema: { id: schema.id, version: schema.version },
        events: [
          {
            type: "points",
            domain: "game",
            scope: "player",
            actorPlayerId: player.id,
            value: 2
          }
        ]
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-04T10:11:00.000Z",
        endedAt: "2026-07-04T10:20:00.000Z",
        score: { red: 2, blue: 0 },
        eventSchema: { id: schema.id, version: schema.version },
        events: [
          {
            type: "points",
            domain: "game",
            scope: "player",
            actorPlayerId: player.id,
            value: 3
          },
          {
            type: "points",
            domain: "game",
            scope: "player",
            actorPlayerId: player.id,
            value: 4
          }
        ]
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const composition: ComposedMatchResponse = await compositionResponse.json();
    const firstPageResponse = await request(
      `/api/matches/${composition.id}/events?limit=2`
    );

    expect(firstPageResponse.status).toBe(200);

    const firstPage = await paginatedBody<{
      round: RoundReference;
      event: { sequence: number; type: string };
    }>(firstPageResponse);

    expect(firstPage.items).toMatchObject([
      {
        round: { kind: "sequential", number: 1, matchId: first.id },
        event: { sequence: 1, type: "points" }
      },
      {
        round: { kind: "sequential", number: 2, matchId: second.id },
        event: { sequence: 1, type: "points" }
      }
    ]);
    expect(firstPage.page.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await request(
      `/api/matches/${composition.id}/events?limit=2&cursor=${firstPage.page.nextCursor}`
    );
    const secondPage = await paginatedBody<{
      round: RoundReference;
      event: { sequence: number; type: string };
    }>(secondPageResponse);

    expect(secondPage.items).toMatchObject([
      {
        round: { kind: "sequential", number: 2, matchId: second.id },
        event: { sequence: 2, type: "points" }
      }
    ]);
    expect(secondPage.page.nextCursor).toBeNull();

    const metricsResponse = await request(
      `/api/matches/${composition.id}/metrics`
    );

    expect(metricsResponse.status).toBe(200);
    expect(await metricsResponse.json()).toMatchObject({
      overall: [{ player: { id: player.id }, metrics: { points: 9 } }],
      rounds: [
        {
          round: { kind: "sequential", number: 1, matchId: first.id },
          metrics: [{ player: { id: player.id }, metrics: { points: 2 } }]
        },
        {
          round: { kind: "sequential", number: 2, matchId: second.id },
          metrics: [{ player: { id: player.id }, metrics: { points: 7 } }]
        }
      ]
    });
  });

  it("keeps zero-event rounds in composed metrics", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: `composition-empty-metrics-${crypto.randomUUID().slice(0, 8)}`,
        definition: {
          events: [
            {
              type: "points",
              valueSchema: { type: "number" },
              aggregations: [
                {
                  target: "match",
                  metric: "points",
                  initial: 0,
                  step: {
                    op: "add",
                    args: [{ path: "acc" }, { path: "event.value" }]
                  }
                }
              ]
            }
          ],
          metrics: [{ key: "points", label: "metric.points" }]
        }
      }
    });

    expect(schemaResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-04T11:10:00.000Z",
        score: { red: 0, blue: 0 },
        eventSchema: { id: schema.id, version: schema.version }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-04T11:20:00.000Z",
        score: { red: 0, blue: 0 },
        eventSchema: { id: schema.id, version: schema.version }
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const composition: ComposedMatchResponse = await compositionResponse.json();
    const metricsResponse = await request(
      `/api/matches/${composition.id}/metrics`
    );

    expect(metricsResponse.status).toBe(200);
    expect(await metricsResponse.json()).toEqual({
      overall: [],
      rounds: [
        {
          round: { kind: "sequential", number: 1, matchId: first.id },
          metrics: []
        },
        {
          round: { kind: "sequential", number: 2, matchId: second.id },
          metrics: []
        }
      ]
    });
  });

  it("counts one logical match in metrics queries and player history", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: `composition-query-${crypto.randomUUID().slice(0, 8)}`,
        definition: {
          events: [
            {
              type: "points",
              valueSchema: { type: "number" },
              aggregations: [
                {
                  target: "actor",
                  metric: "points",
                  initial: 0,
                  step: {
                    op: "add",
                    args: [{ path: "acc" }, { path: "event.value" }]
                  }
                }
              ]
            }
          ],
          metrics: [{ key: "points", label: "metric.points" }]
        }
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `composition-query-${crypto.randomUUID()}`,
        name: `Player ${crypto.randomUUID().slice(0, 8)}`
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-05T10:00:00.000Z",
        endedAt: "2026-07-05T10:10:00.000Z",
        score: { red: 1, blue: 0 },
        eventSchema: { id: schema.id, version: schema.version },
        events: [
          {
            type: MATCH_ROOM_EVENT.PlayerTeamChange,
            domain: "room",
            scope: "player",
            actorPlayerId: player.id,
            team: "red",
            roomPlayerId: 1,
            occurredAt: "2026-07-05T10:00:00.000Z",
            elapsedSeconds: 0,
            value: {}
          },
          {
            type: "points",
            domain: "game",
            scope: "player",
            actorPlayerId: player.id,
            value: 2
          }
        ]
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-05T10:11:00.000Z",
        endedAt: "2026-07-05T10:20:00.000Z",
        score: { red: 2, blue: 0 },
        eventSchema: { id: schema.id, version: schema.version },
        events: [
          {
            type: MATCH_ROOM_EVENT.PlayerTeamChange,
            domain: "room",
            scope: "player",
            actorPlayerId: player.id,
            team: "red",
            roomPlayerId: 1,
            occurredAt: "2026-07-05T10:11:00.000Z",
            elapsedSeconds: 0,
            value: {}
          },
          {
            type: "points",
            domain: "game",
            scope: "player",
            actorPlayerId: player.id,
            value: 3
          }
        ]
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const composition: ComposedMatchResponse = await compositionResponse.json();
    const queryResponse = await request("/api/matches/metrics/query", {
      method: "POST",
      body: {
        schema: { id: schema.id, version: schema.version },
        filters: { matchIds: [composition.id] },
        group: { by: "player" }
      }
    });

    expect(queryResponse.status).toBe(200);
    expect(await queryResponse.json()).toMatchObject({
      items: [
        {
          group: { type: "player", id: player.id },
          metrics: { points: 5 },
          contribution: {
            matchesCount: 1,
            roundsCount: 2,
            eventsCount: 2
          }
        }
      ],
      meta: {
        totals: { matchesCount: 1, roundsCount: 2, eventsCount: 2 }
      }
    });
    const childFilterResponse = await request("/api/matches/metrics/query", {
      method: "POST",
      body: {
        schema: { id: schema.id, version: schema.version },
        filters: { matchIds: [second.id] },
        group: { by: "player" }
      }
    });

    expect(childFilterResponse.status).toBe(200);
    expect(await childFilterResponse.json()).toMatchObject({
      items: [
        {
          group: { type: "player", id: player.id },
          metrics: { points: 5 },
          contribution: { matchesCount: 1, roundsCount: 2, eventsCount: 2 }
        }
      ]
    });

    const initiatedPeriodResponse = await request(
      "/api/matches/metrics/query",
      {
        method: "POST",
        body: {
          schema: { id: schema.id, version: schema.version },
          filters: {
            matchIds: [composition.id],
            period: {
              field: "initiatedAt",
              from: "2026-07-05T10:05:00.000Z"
            }
          },
          group: { by: "player" }
        }
      }
    );
    const endedPeriodResponse = await request("/api/matches/metrics/query", {
      method: "POST",
      body: {
        schema: { id: schema.id, version: schema.version },
        filters: {
          matchIds: [composition.id],
          period: {
            field: "endedAt",
            to: "2026-07-05T10:15:00.000Z"
          }
        },
        group: { by: "player" }
      }
    });

    expect(initiatedPeriodResponse.status).toBe(200);
    expect(await initiatedPeriodResponse.json()).toMatchObject({ items: [] });
    expect(endedPeriodResponse.status).toBe(200);
    expect(await endedPeriodResponse.json()).toMatchObject({ items: [] });

    const historyResponse = await request(
      `/api/players/${player.id}/matches?limit=100`
    );
    const history = await paginatedItems<
      PhysicalMatchResponse | ComposedMatchResponse
    >(historyResponse);

    expect(history.filter((match) => match.id === composition.id)).toHaveLength(
      1
    );
    expect(history.map((match) => match.id)).not.toContain(first.id);
    expect(history.map((match) => match.id)).not.toContain(second.id);
  });

  it("keeps rounds unchanged after invalid replacement, then replaces and unbinds them", async () => {
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-06T10:00:00.000Z",
        endedAt: "2026-07-06T10:08:00.000Z",
        score: { red: 1, blue: 0 }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-06T10:10:00.000Z",
        endedAt: "2026-07-06T10:18:00.000Z",
        score: { red: 2, blue: 1 }
      }
    });
    const replacementMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-06T10:20:00.000Z",
        endedAt: "2026-07-06T10:28:00.000Z",
        score: { red: 3, blue: 2 }
      }
    });
    const replacementFirstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-06T10:19:00.000Z",
        endedAt: "2026-07-06T10:20:00.000Z",
        score: { red: 0, blue: 0 }
      }
    });
    const extraTimeResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-06T10:30:00.000Z",
        endedAt: "2026-07-06T10:38:00.000Z",
        score: { red: 4, blue: 3 }
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(replacementMatchResponse.status).toBe(201);
    expect(replacementFirstResponse.status).toBe(201);
    expect(extraTimeResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const replacement: PhysicalMatchResponse =
      await replacementMatchResponse.json();
    const replacementFirst: PhysicalMatchResponse =
      await replacementFirstResponse.json();
    const extraTime: PhysicalMatchResponse = await extraTimeResponse.json();
    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const original: ComposedMatchResponse = await compositionResponse.json();
    const invalidReplacementResponse = await request(
      `/api/matches/${original.id}/rounds`,
      {
        method: "PUT",
        body: {
          rounds: [
            { kind: "sequential", number: 1, matchId: replacementFirst.id },
            { kind: "sequential", number: 2, matchId: "aaaaaaaa" },
            { kind: "extra-time", number: null, matchId: extraTime.id }
          ]
        }
      }
    );

    expect(invalidReplacementResponse.status).toBe(404);

    const unchangedResponse = await request(`/api/matches/${original.id}`);

    expect(unchangedResponse.status).toBe(200);
    expect(await unchangedResponse.json()).toEqual(original);

    const replacementResponse = await request(
      `/api/matches/${original.id}/rounds`,
      {
        method: "PUT",
        body: {
          rounds: [
            { kind: "sequential", number: 1, matchId: replacementFirst.id },
            { kind: "sequential", number: 2, matchId: replacement.id },
            { kind: "extra-time", number: null, matchId: extraTime.id }
          ]
        }
      }
    );

    expect(replacementResponse.status).toBe(200);

    const replaced: ComposedMatchResponse = await replacementResponse.json();

    expect(replaced.id).toBe(original.id);
    expect(replaced.createdAt).toBe(replacementFirst.createdAt);
    expect(replaced.initiatedAt).toBe(replacementFirst.initiatedAt);
    expect(replaced.score).toEqual(extraTime.score);
    expect(replaced.rounds.map((round) => round.matchId)).toEqual([
      replacementFirst.id,
      replacement.id,
      extraTime.id
    ]);

    const logicalListResponse = await request("/api/matches?limit=100");
    const logicalList = await paginatedItems<
      PhysicalMatchResponse | ComposedMatchResponse
    >(logicalListResponse);

    expect(
      logicalList.filter((match) => match.id === original.id)
    ).toHaveLength(1);
    expect(logicalList.map((match) => match.id)).not.toContain(
      replacementFirst.id
    );

    const removedRoundResponse = await request(`/api/matches/${second.id}`);

    expect(removedRoundResponse.status).toBe(200);
    expect(await removedRoundResponse.json()).toMatchObject({
      kind: "single",
      id: second.id
    });

    const unbindResponse = await request(`/api/matches/${original.id}/rounds`, {
      method: "DELETE"
    });

    expect(unbindResponse.status).toBe(204);
    expect(await unbindResponse.text()).toBe("");
    expect((await request(`/api/matches/${original.id}`)).status).toBe(404);

    const listResponse = await request("/api/matches?limit=100");
    const listed = await paginatedItems<PhysicalMatchResponse>(listResponse);

    expect(listed.map((match) => match.id)).toEqual(
      expect.arrayContaining([
        first.id,
        replacementFirst.id,
        second.id,
        replacement.id,
        extraTime.id
      ])
    );
  });

  it("keeps physical recording writes available after binding", async () => {
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-07T10:00:00.000Z",
        endedAt: "2026-07-07T10:10:00.000Z",
        score: { red: 1, blue: 0 }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-07T10:11:00.000Z",
        endedAt: "2026-07-07T10:20:00.000Z",
        score: { red: 2, blue: 0 }
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const composition: ComposedMatchResponse = await compositionResponse.json();
    const form = new FormData();

    form.set("file", headlessAvatarEmojiRecordingFile());

    const recordingResponse = await request("/api/recs", {
      method: "POST",
      body: form
    });

    expect([200, 201]).toContain(recordingResponse.status);

    const recording: RecordingResponse = await recordingResponse.json();
    const associationResponse = await request(
      `/api/matches/${second.id}/recording`,
      {
        method: "PATCH",
        body: { recordingId: recording.id }
      }
    );

    expect(associationResponse.status).toBe(200);
    expect(await associationResponse.json()).toMatchObject({
      id: second.id,
      recording: { id: recording.id }
    });

    const roundResponse = await request(
      `/api/matches/${composition.id}/rounds/2`
    );

    expect(roundResponse.status).toBe(200);
    expect(await roundResponse.json()).toMatchObject({
      match: { id: second.id, recording: { id: recording.id } }
    });
  });

  it("rejects malformed round collections without persisting a composition", async () => {
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-08T10:00:00.000Z",
        endedAt: "2026-07-08T10:08:00.000Z",
        score: { red: 1, blue: 0 }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-08T10:10:00.000Z",
        endedAt: "2026-07-08T10:18:00.000Z",
        score: { red: 2, blue: 1 }
      }
    });
    const thirdResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-07-08T10:20:00.000Z",
        endedAt: "2026-07-08T10:28:00.000Z",
        score: { red: 3, blue: 2 }
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(thirdResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const third: PhysicalMatchResponse = await thirdResponse.json();
    const tooFewRoundsResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [{ kind: "sequential", number: 1, matchId: first.id }]
      }
    });
    const duplicateMatchResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: first.id }
        ]
      }
    });
    const skippedRoundResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 3, matchId: second.id }
        ]
      }
    });
    const nonOneFirstRoundResponse = await request(
      "/api/matches/compositions",
      {
        method: "POST",
        body: {
          rounds: [
            { kind: "sequential", number: 2, matchId: first.id },
            { kind: "sequential", number: 3, matchId: second.id }
          ]
        }
      }
    );
    const multipleExtraTimesResponse = await request(
      "/api/matches/compositions",
      {
        method: "POST",
        body: {
          rounds: [
            { kind: "sequential", number: 1, matchId: first.id },
            { kind: "extra-time", number: null, matchId: second.id },
            { kind: "extra-time", number: null, matchId: third.id }
          ]
        }
      }
    );
    const nonFinalExtraTimeResponse = await request(
      "/api/matches/compositions",
      {
        method: "POST",
        body: {
          rounds: [
            { kind: "extra-time", number: null, matchId: first.id },
            { kind: "sequential", number: 1, matchId: second.id }
          ]
        }
      }
    );
    const noSequentialRoundResponse = await request(
      "/api/matches/compositions",
      {
        method: "POST",
        body: {
          rounds: [
            { kind: "extra-time", number: null, matchId: first.id },
            { kind: "extra-time", number: null, matchId: second.id }
          ]
        }
      }
    );

    expect(tooFewRoundsResponse.status).toBe(400);
    expect(await tooFewRoundsResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" }
    });
    expect(duplicateMatchResponse.status).toBe(400);
    expect(await duplicateMatchResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "A physical match cannot appear more than once"
      }
    });
    expect(skippedRoundResponse.status).toBe(400);
    expect(await skippedRoundResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Sequential rounds must be contiguous starting at 1"
      }
    });
    expect(nonOneFirstRoundResponse.status).toBe(400);
    expect(await nonOneFirstRoundResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Sequential rounds must be contiguous starting at 1"
      }
    });
    expect(multipleExtraTimesResponse.status).toBe(400);
    expect(await multipleExtraTimesResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "A composed match can contain only one extra time"
      }
    });
    expect(nonFinalExtraTimeResponse.status).toBe(400);
    expect(await nonFinalExtraTimeResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Extra time must be the final round"
      }
    });
    expect(noSequentialRoundResponse.status).toBe(400);
    expect(await noSequentialRoundResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "A composed match must contain a sequential first round"
      }
    });

    const listResponse = await request("/api/matches?limit=100");
    const listed = await paginatedItems<PhysicalMatchResponse>(listResponse);

    expect(listed.map((item) => item.id)).toContain(first.id);
    expect(listed.map((item) => item.id)).toContain(second.id);
    expect(listed.map((item) => item.id)).toContain(third.id);
  });

  it("rejects invalid round shapes at the HTTP boundary", async () => {
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-09T10:10:00.000Z",
        score: { red: 1, blue: 0 }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-09T10:20:00.000Z",
        score: { red: 2, blue: 0 }
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const zeroRoundNumberResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 0, matchId: first.id },
          { kind: "sequential", number: 1, matchId: second.id }
        ]
      }
    });
    const unknownRoundKindResponse = await request(
      "/api/matches/compositions",
      {
        method: "POST",
        body: {
          rounds: [
            { kind: "knockout", number: 1, matchId: first.id },
            { kind: "sequential", number: 2, matchId: second.id }
          ]
        }
      }
    );
    const numberedExtraTimeResponse = await request(
      "/api/matches/compositions",
      {
        method: "POST",
        body: {
          rounds: [
            { kind: "extra-time", number: 3, matchId: first.id },
            { kind: "sequential", number: 1, matchId: second.id }
          ]
        }
      }
    );
    const missingRoundNumberResponse = await request(
      "/api/matches/compositions",
      {
        method: "POST",
        body: {
          rounds: [
            { kind: "sequential", matchId: first.id },
            { kind: "sequential", number: 2, matchId: second.id }
          ]
        }
      }
    );

    expect(zeroRoundNumberResponse.status).toBe(400);
    expect(await zeroRoundNumberResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" }
    });
    expect(unknownRoundKindResponse.status).toBe(400);
    expect(await unknownRoundKindResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" }
    });
    expect(numberedExtraTimeResponse.status).toBe(400);
    expect(await numberedExtraTimeResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" }
    });
    expect(missingRoundNumberResponse.status).toBe(400);
    expect(await missingRoundNumberResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" }
    });
  });

  it("rejects missing, ongoing, already-bound, and composed round IDs", async () => {
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-10T10:10:00.000Z",
        score: { red: 1, blue: 0 }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-10T10:20:00.000Z",
        score: { red: 2, blue: 0 }
      }
    });
    const freeResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-10T10:30:00.000Z",
        score: { red: 3, blue: 0 }
      }
    });
    const ongoingResponse = await request("/api/matches", {
      method: "POST",
      body: { status: "ongoing" }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(freeResponse.status).toBe(201);
    expect(ongoingResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const free: PhysicalMatchResponse = await freeResponse.json();
    const ongoing: PhysicalMatchResponse = await ongoingResponse.json();
    const missingResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: "aaaaaaaa" }
        ]
      }
    });

    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Physical match not found" }
    });

    const ongoingBindingResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: ongoing.id }
        ]
      }
    });

    expect(ongoingBindingResponse.status).toBe(400);
    expect(await ongoingBindingResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Only completed matches can be bound"
      }
    });

    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const composition: ComposedMatchResponse = await compositionResponse.json();
    const alreadyBoundResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: free.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });
    const nestedResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: free.id },
          { kind: "sequential", number: 2, matchId: composition.id }
        ]
      }
    });

    expect(alreadyBoundResponse.status).toBe(400);
    expect(await alreadyBoundResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Match is already bound to a composed match"
      }
    });
    expect(nestedResponse.status).toBe(400);
    expect(await nestedResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Composed matches cannot be used as rounds"
      }
    });
  });

  it("rejects incompatible game modes and event schemas, including null mismatches", async () => {
    const firstModeResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: `composition-mode-a-${crypto.randomUUID().slice(0, 8)}`
      }
    });
    const secondModeResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: `composition-mode-b-${crypto.randomUUID().slice(0, 8)}`
      }
    });
    const firstSchemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: `composition-schema-a-${crypto.randomUUID().slice(0, 8)}`,
        definition: {
          events: [
            {
              type: "points-a",
              valueSchema: { type: "number" },
              aggregations: [
                {
                  target: "match",
                  metric: "points-a",
                  initial: 0,
                  step: {
                    op: "add",
                    args: [{ path: "acc" }, { path: "event.value" }]
                  }
                }
              ]
            }
          ],
          metrics: [{ key: "points-a", label: "metric.points-a" }]
        }
      }
    });
    const secondSchemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: `composition-schema-b-${crypto.randomUUID().slice(0, 8)}`,
        definition: {
          events: [
            {
              type: "points-b",
              valueSchema: { type: "number" },
              aggregations: [
                {
                  target: "match",
                  metric: "points-b",
                  initial: 0,
                  step: {
                    op: "add",
                    args: [{ path: "acc" }, { path: "event.value" }]
                  }
                }
              ]
            }
          ],
          metrics: [{ key: "points-b", label: "metric.points-b" }]
        }
      }
    });

    expect(firstModeResponse.status).toBe(201);
    expect(secondModeResponse.status).toBe(201);
    expect(firstSchemaResponse.status).toBe(201);
    expect(secondSchemaResponse.status).toBe(201);

    const firstMode: GameModeResponse = await firstModeResponse.json();
    const secondMode: GameModeResponse = await secondModeResponse.json();
    const firstSchema: EventSchemaResponse = await firstSchemaResponse.json();
    const secondSchema: EventSchemaResponse = await secondSchemaResponse.json();
    const baseResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-11T10:10:00.000Z",
        score: { red: 1, blue: 0 },
        gameMode: { name: firstMode.name },
        eventSchema: { id: firstSchema.id, version: firstSchema.version }
      }
    });
    const differentModeResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-11T10:20:00.000Z",
        score: { red: 2, blue: 0 },
        gameMode: { name: secondMode.name },
        eventSchema: { id: firstSchema.id, version: firstSchema.version }
      }
    });
    const differentSchemaResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-11T10:30:00.000Z",
        score: { red: 3, blue: 0 },
        gameMode: { name: firstMode.name },
        eventSchema: { id: secondSchema.id, version: secondSchema.version }
      }
    });
    const noModeResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-11T10:40:00.000Z",
        score: { red: 4, blue: 0 },
        eventSchema: { id: firstSchema.id, version: firstSchema.version }
      }
    });
    const noSchemaResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-11T10:50:00.000Z",
        score: { red: 5, blue: 0 },
        gameMode: { name: firstMode.name }
      }
    });

    expect(baseResponse.status).toBe(201);
    expect(differentModeResponse.status).toBe(201);
    expect(differentSchemaResponse.status).toBe(201);
    expect(noModeResponse.status).toBe(201);
    expect(noSchemaResponse.status).toBe(201);

    const base: PhysicalMatchResponse = await baseResponse.json();
    const differentMode: PhysicalMatchResponse =
      await differentModeResponse.json();
    const differentSchema: PhysicalMatchResponse =
      await differentSchemaResponse.json();
    const noMode: PhysicalMatchResponse = await noModeResponse.json();
    const noSchema: PhysicalMatchResponse = await noSchemaResponse.json();
    const modeMismatchResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: base.id },
          { kind: "sequential", number: 2, matchId: differentMode.id }
        ]
      }
    });
    const schemaMismatchResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: base.id },
          { kind: "sequential", number: 2, matchId: differentSchema.id }
        ]
      }
    });
    const nullModeMismatchResponse = await request(
      "/api/matches/compositions",
      {
        method: "POST",
        body: {
          rounds: [
            { kind: "sequential", number: 1, matchId: base.id },
            { kind: "sequential", number: 2, matchId: noMode.id }
          ]
        }
      }
    );
    const nullSchemaMismatchResponse = await request(
      "/api/matches/compositions",
      {
        method: "POST",
        body: {
          rounds: [
            { kind: "sequential", number: 1, matchId: base.id },
            { kind: "sequential", number: 2, matchId: noSchema.id }
          ]
        }
      }
    );

    expect(modeMismatchResponse.status).toBe(400);
    expect(await modeMismatchResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "All rounds must use the same game mode"
      }
    });
    expect(schemaMismatchResponse.status).toBe(400);
    expect(await schemaMismatchResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "All rounds must use the same event schema version"
      }
    });
    expect(nullModeMismatchResponse.status).toBe(400);
    expect(await nullModeMismatchResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "All rounds must use the same game mode"
      }
    });
    expect(nullSchemaMismatchResponse.status).toBe(400);
    expect(await nullSchemaMismatchResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "All rounds must use the same event schema version"
      }
    });
  });

  it("rejects scores that are not cumulative", async () => {
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-12T10:10:00.000Z",
        score: { red: 3, blue: 2 }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-12T10:20:00.000Z",
        score: { red: 2, blue: 3 }
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const response = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Round scores must be cumulative"
      }
    });
  });

  it("returns 404 for missing compositions and rounds", async () => {
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-13T10:10:00.000Z",
        score: { red: 1, blue: 0 }
      }
    });
    const secondResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-07-13T10:20:00.000Z",
        score: { red: 2, blue: 0 }
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const first: PhysicalMatchResponse = await firstResponse.json();
    const second: PhysicalMatchResponse = await secondResponse.json();
    const compositionResponse = await request("/api/matches/compositions", {
      method: "POST",
      body: {
        rounds: [
          { kind: "sequential", number: 1, matchId: first.id },
          { kind: "sequential", number: 2, matchId: second.id }
        ]
      }
    });

    expect(compositionResponse.status).toBe(201);

    const composition: ComposedMatchResponse = await compositionResponse.json();
    const missingCompositionRoundResponse = await request(
      "/api/matches/caaaaaaaa/rounds/1"
    );
    const missingCompositionExtraTimeResponse = await request(
      "/api/matches/caaaaaaaa/extra-time"
    );
    const missingCompositionReplacementResponse = await request(
      "/api/matches/caaaaaaaa/rounds",
      {
        method: "PUT",
        body: {
          rounds: [
            { kind: "sequential", number: 1, matchId: first.id },
            { kind: "sequential", number: 2, matchId: second.id }
          ]
        }
      }
    );
    const missingRoundResponse = await request(
      `/api/matches/${composition.id}/rounds/99`
    );
    const missingExtraTimeResponse = await request(
      `/api/matches/${composition.id}/extra-time`
    );

    expect(missingCompositionRoundResponse.status).toBe(404);
    expect(missingCompositionExtraTimeResponse.status).toBe(404);
    expect(missingCompositionReplacementResponse.status).toBe(404);
    expect(missingRoundResponse.status).toBe(404);
    expect(missingExtraTimeResponse.status).toBe(404);
  });
});
