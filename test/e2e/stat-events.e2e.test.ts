import { describe, expect, it } from "bun:test";
import { paginatedItems, request } from "@/test/e2e/helpers/helpers";

type JsonObject = Record<string, unknown>;

type MatchResponse = {
  id: string;
  eventSchema: {
    id: string;
    version: number;
  } | null;
};

type MatchMetricsResponse = Array<{
  player: {
    id: string;
  };
  metrics: Record<string, unknown>;
}>;

type PlayerResponse = {
  id: string;
  name: string;
};

type EventSchemaResponse = {
  id: string;
  name: string;
  title: string;
  version: number;
  isLatest: boolean;
  definition: JsonObject;
  createdAt: string;
  updatedAt: string;
};

describe("event schemas", () => {
  it("creates, lists, gets, and updates the latest schema version", async () => {
    const createResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("match-stats"),
        title: "Match Stats",
        definition: baseDefinition()
      }
    });

    expect(createResponse.status).toBe(201);

    const schema: EventSchemaResponse = await createResponse.json();
    const schemaId = schema.id;

    expect(schema.id).toEqual(expect.any(String));
    expect(schema.name).toEqual(expect.stringMatching(/^match-stats-/));
    expect(schema.title).toBe("Match Stats");
    expect(schema.version).toBe(1);
    expect(schema.isLatest).toBe(true);
    expect(schema.definition).toEqual(baseDefinition());
    expect(schema.createdAt).toEqual(expect.any(String));
    expect(schema.updatedAt).toEqual(expect.any(String));

    const listResponse = await request("/api/event-schemas");

    expect(listResponse.status).toBe(200);
    expect(await paginatedItems(listResponse)).toContainEqual(schema);

    const getResponse = await request(`/api/event-schemas/${schemaId}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(schema);

    const updateResponse = await request(
      `/api/event-schemas/${schema.id}/versions/1`,
      {
        method: "PATCH",
        body: {
          definition: {
            ...baseDefinition(),
            events: [
              {
                ...baseDefinition().events[0],
                title: "Goal"
              },
              baseDefinition().events[1],
              baseDefinition().events[2]
            ]
          }
        }
      }
    );

    expect(updateResponse.status).toBe(200);

    const updated: EventSchemaResponse = await updateResponse.json();

    expect(updated.version).toBe(1);
    expect(updated.definition).toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "goal",
          title: "Goal"
        })
      ])
    });
  });

  it("rejects breaking direct updates and publishes a new version", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });

    expect(schemaResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const breakingDefinition = {
      events: [baseDefinition().events[0]]
    };

    const updateResponse = await request(
      `/api/event-schemas/${schema.id}/versions/1`,
      {
        method: "PATCH",
        body: {
          definition: breakingDefinition
        }
      }
    );

    expect(updateResponse.status).toBe(400);
    expect(await updateResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Breaking changes must be published as a new version"
      }
    });

    const publishResponse = await request(
      `/api/event-schemas/${schema.id}/versions`,
      {
        method: "POST",
        body: {
          definition: breakingDefinition
        }
      }
    );

    expect(publishResponse.status).toBe(201);

    const version: EventSchemaResponse = await publishResponse.json();

    expect(version).toMatchObject({
      id: schema.id,
      version: 2,
      isLatest: true,
      definition: breakingDefinition
    });
  });

  it("rejects invalid schema definitions", async () => {
    const invalidDefinitions = [
      {
        events: [
          {
            type: "goal"
          },
          {
            type: "goal"
          }
        ]
      },
      {
        events: [
          {
            type: "Goal"
          }
        ]
      },
      {
        events: [
          {
            type: "goal",
            valueSchema: {
              type: "integer"
            }
          }
        ]
      },
      {
        events: [
          {
            type: "goal",
            aggregations: [
              {
                target: "actor",
                metric: "goals",
                initial: 0,
                step: {
                  op: 123
                }
              }
            ]
          }
        ]
      },
      {
        events: [
          {
            type: "goal"
          }
        ],
        virtualMetrics: [
          {
            metric: "Total",
            value: {
              path: "metrics.goals"
            }
          }
        ]
      },
      {
        ...baseDefinition(),
        featuredMetrics: {
          points: "missing"
        }
      },
      {
        ...baseDefinition(),
        featuredMetrics: {
          rating: "points"
        }
      },
      {
        ...baseDefinition(),
        featuredMetrics: {
          points: "Points"
        }
      }
    ];

    for (const definition of invalidDefinitions) {
      const response = await request("/api/event-schemas", {
        method: "POST",
        body: {
          name: uniqueName("invalid-schema"),
          definition
        }
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid event schema definition"
        }
      });
    }
  });

  it("allows additive latest updates and rejects updates to old versions", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });

    expect(schemaResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const additiveDefinition = {
      ...baseDefinition(),
      events: [
        ...baseDefinition().events,
        {
          type: "save",
          valueSchema: {
            type: "boolean"
          }
        }
      ],
      virtualMetrics: [
        ...baseDefinition().virtualMetrics,
        {
          metric: "total-points",
          value: {
            path: "metrics.points"
          }
        }
      ]
    };

    const updateResponse = await request(
      `/api/event-schemas/${schema.id}/versions/1`,
      {
        method: "PATCH",
        body: {
          definition: additiveDefinition
        }
      }
    );

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({
      version: 1,
      definition: additiveDefinition
    });

    const publishResponse = await request(
      `/api/event-schemas/${schema.id}/versions`,
      {
        method: "POST",
        body: {
          definition: {
            events: [baseDefinition().events[0]]
          }
        }
      }
    );

    expect(publishResponse.status).toBe(201);

    const oldVersionUpdateResponse = await request(
      `/api/event-schemas/${schema.id}/versions/1`,
      {
        method: "PATCH",
        body: {
          definition: additiveDefinition
        }
      }
    );

    expect(oldVersionUpdateResponse.status).toBe(400);
    expect(await oldVersionUpdateResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Only the latest event schema version can be updated"
      }
    });
  });

  it("keeps old matches bound to their original schema version", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `version-bound-${crypto.randomUUID()}`,
        name: "version-bound"
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const oldMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(oldMatchResponse.status).toBe(201);

    const oldMatch: MatchResponse = await oldMatchResponse.json();

    expect(oldMatch.eventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const publishResponse = await request(
      `/api/event-schemas/${schema.id}/versions`,
      {
        method: "POST",
        body: {
          definition: {
            events: [baseDefinition().events[0]]
          }
        }
      }
    );

    expect(publishResponse.status).toBe(201);

    const nextVersion: EventSchemaResponse = await publishResponse.json();
    const oldMatchAssistResponse = await request(
      `/api/matches/${oldMatch.id}/events`,
      {
        method: "POST",
        body: {
          type: "assist",
          domain: "game",
          scope: "player",
          actorPlayerId: player.id,
          value: {
            amount: 1
          }
        }
      }
    );
    const newMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: nextVersion.id,
          version: nextVersion.version
        }
      }
    });

    expect(newMatchResponse.status).toBe(201);

    const newMatch: MatchResponse = await newMatchResponse.json();

    expect(newMatch.eventSchema).toEqual({
      id: nextVersion.id,
      version: nextVersion.version
    });

    const newMatchAssistResponse = await request(
      `/api/matches/${newMatch.id}/events`,
      {
        method: "POST",
        body: {
          type: "assist",
          domain: "game",
          scope: "player",
          actorPlayerId: player.id,
          value: {
            amount: 1
          }
        }
      }
    );

    expect(oldMatchAssistResponse.status).toBe(201);
    expect(newMatchAssistResponse.status).toBe(400);
  });

  it("gets event schemas by name and version", async () => {
    const schemaName = uniqueName("lookup-schema");
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: schemaName,
        definition: baseDefinition()
      }
    });

    expect(schemaResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const publishResponse = await request(
      `/api/event-schemas/${schema.id}/versions`,
      {
        method: "POST",
        body: {
          definition: {
            events: [baseDefinition().events[0]]
          }
        }
      }
    );

    expect(publishResponse.status).toBe(201);

    const latestByNameResponse = await request(
      `/api/event-schemas/by-name/${schemaName}`
    );
    const firstVersionByNameResponse = await request(
      `/api/event-schemas/by-name/${schemaName}/versions/1`
    );
    const missingByNameResponse = await request(
      `/api/event-schemas/by-name/${uniqueName("missing")}`
    );

    expect(latestByNameResponse.status).toBe(200);
    expect(await latestByNameResponse.json()).toMatchObject({
      id: schema.id,
      name: schemaName,
      version: 2,
      isLatest: true
    });
    expect(firstVersionByNameResponse.status).toBe(200);
    expect(await firstVersionByNameResponse.json()).toMatchObject({
      id: schema.id,
      name: schemaName,
      version: 1,
      isLatest: false,
      definition: baseDefinition()
    });
    expect(missingByNameResponse.status).toBe(404);
  });

  it("accepts reusable presentation metadata and rejects invalid metric metadata", async () => {
    const validResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("metadata-schema"),
        definition: {
          ...metadataDefinition(),
          presentation: {
            label: "schema.test",
            description: "schema.test.description"
          },
          events: [
            {
              ...baseDefinition().events[0],
              presentation: {
                label: "event.goal"
              }
            },
            baseDefinition().events[1],
            baseDefinition().events[2]
          ]
        }
      }
    });

    expect(validResponse.status).toBe(201);
    expect(await validResponse.json()).toMatchObject({
      definition: expect.objectContaining({
        presentation: {
          label: "schema.test",
          description: "schema.test.description"
        },
        metrics: expect.arrayContaining([
          expect.objectContaining({
            key: "goals",
            label: "metric.goals"
          })
        ])
      })
    });

    const invalidDefinitions = [
      {
        ...baseDefinition(),
        metrics: [
          {
            key: "unknown-metric",
            label: "metric.unknown"
          }
        ]
      },
      {
        ...baseDefinition(),
        metrics: [
          {
            key: "goals",
            label: "metric.goals"
          },
          {
            key: "goals",
            label: "metric.goals-again"
          }
        ]
      },
      {
        ...baseDefinition(),
        metrics: [
          {
            key: "goals",
            label: "Metric.Goals"
          }
        ]
      },
      {
        ...baseDefinition(),
        metrics: [
          {
            key: "goals",
            label: "metric.goals",
            valueType: "integer"
          }
        ]
      },
      {
        ...baseDefinition(),
        metrics: [
          {
            key: "goals",
            label: "metric.goals",
            precision: -1
          }
        ]
      },
      {
        ...baseDefinition(),
        presentation: {
          label: "Schema.Bad"
        }
      }
    ];

    for (const definition of invalidDefinitions) {
      const response = await request("/api/event-schemas", {
        method: "POST",
        body: {
          name: uniqueName("invalid-metadata"),
          definition
        }
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid event schema definition"
        }
      });
    }
  });
});

describe("match events", () => {
  it("adds events to a schema-bound ongoing match and derives metrics", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });
    const firstPlayerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `stats-first-${crypto.randomUUID()}`,
        name: "stats-first"
      }
    });
    const secondPlayerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `stats-second-${crypto.randomUUID()}`,
        name: "stats-second"
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(firstPlayerResponse.status).toBe(201);
    expect(secondPlayerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const firstPlayer: PlayerResponse = await firstPlayerResponse.json();
    const secondPlayer: PlayerResponse = await secondPlayerResponse.json();
    const matchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(matchResponse.status).toBe(201);

    const match: MatchResponse = await matchResponse.json();

    expect(match.eventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const firstGoalResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        type: "goal",
        domain: "game",
        scope: "player",
        actorPlayerId: firstPlayer.id,
        value: 3,
        occurredAt: "2026-05-10T12:01:00.000Z",
        tick: 120
      }
    });
    const assistResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        type: "assist",
        domain: "game",
        scope: "player",
        actorPlayerId: firstPlayer.id,
        value: {
          amount: 2
        }
      }
    });
    const noteResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        type: "note",
        domain: "game",
        scope: "player",
        actorPlayerId: secondPlayer.id,
        value: "saved"
      }
    });

    expect(firstGoalResponse.status).toBe(201);
    expect(assistResponse.status).toBe(201);
    expect(noteResponse.status).toBe(201);

    expect(await firstGoalResponse.json()).toMatchObject({
      sequence: 1,
      type: "goal",
      domain: "game",
      scope: "player",
      actorPlayer: {
        id: firstPlayer.id
      },
      subjectPlayer: null,
      value: 3,
      occurredAt: "2026-05-10T12:01:00.000Z",
      tick: 120,
      disabled: false
    });

    const listResponse = await request(`/api/matches/${match.id}/events`);

    expect(listResponse.status).toBe(200);

    const events = await paginatedItems<{ sequence: number }>(listResponse);

    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);

    const metricsResponse = await request(`/api/matches/${match.id}/metrics`);

    expect(metricsResponse.status).toBe(200);

    const metrics: MatchMetricsResponse = await metricsResponse.json();

    expect(metrics).toEqual([
      {
        player: expect.objectContaining({
          id: firstPlayer.id
        }),
        metrics: {
          goals: 1,
          points: 3,
          assists: 2,
          contributions: 3
        }
      }
    ]);
  });

  it("queries aggregate metrics with schema metadata and localized labels", async () => {
    const schemaName = uniqueName("query-schema");
    const metricLabelPrefix = `metric.${schemaName}`;
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: schemaName,
        definition: metadataDefinition(metricLabelPrefix)
      }
    });
    const accountResponse = await request("/api/accounts", {
      method: "POST",
      body: {
        name: `Acct${crypto.randomUUID().slice(0, 8)}`,
        password: "pass1234",
        externalId: uniqueDiscordId()
      }
    });
    const firstPlayerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `query-first-${crypto.randomUUID()}`,
        name: "query-first"
      }
    });
    const secondPlayerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `query-second-${crypto.randomUUID()}`,
        name: "query-second"
      }
    });
    const guestPlayerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `query-guest-${crypto.randomUUID()}`,
        name: "query-guest"
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(accountResponse.status).toBe(201);
    expect(firstPlayerResponse.status).toBe(201);
    expect(secondPlayerResponse.status).toBe(201);
    expect(guestPlayerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const account = await accountResponse.json();
    const firstPlayer: PlayerResponse = await firstPlayerResponse.json();
    const secondPlayer: PlayerResponse = await secondPlayerResponse.json();
    const guestPlayer: PlayerResponse = await guestPlayerResponse.json();

    for (const player of [firstPlayer, secondPlayer]) {
      const response = await request(`/api/players/${player.id}/account`, {
        method: "PATCH",
        body: {
          accountUuid: account.uuid
        }
      });

      expect(response.status).toBe(200);
    }

    const labelsResponse = await request("/api/values/bulk", {
      method: "POST",
      body: {
        values: [
          {
            value: `${metricLabelPrefix}.goals`,
            language: "pt",
            label: "Gols"
          },
          {
            value: `${metricLabelPrefix}.points`,
            language: "en",
            label: "Points"
          },
          {
            value: `${metricLabelPrefix}.assists`,
            language: "pt",
            label: "Assistências"
          },
          {
            value: `${metricLabelPrefix}.contributions`,
            language: "pt",
            label: "Contribuições"
          }
        ]
      }
    });

    expect(labelsResponse.status).toBe(200);

    const matchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        initiatedAt: "2026-05-10T12:00:00.000Z",
        eventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(matchResponse.status).toBe(201);

    const match: MatchResponse = await matchResponse.json();

    for (const event of [
      {
        type: "goal",
        domain: "game",
        scope: "player",
        actorPlayerId: firstPlayer.id,
        value: 3
      },
      {
        type: "assist",
        domain: "game",
        scope: "player",
        actorPlayerId: firstPlayer.id,
        value: {
          amount: 2
        }
      },
      {
        type: "goal",
        domain: "game",
        scope: "player",
        actorPlayerId: secondPlayer.id,
        value: 2
      },
      {
        type: "goal",
        domain: "game",
        scope: "player",
        actorPlayerId: guestPlayer.id,
        value: 4
      }
    ]) {
      const response = await request(`/api/matches/${match.id}/events`, {
        method: "POST",
        body: event
      });

      expect(response.status).toBe(201);
    }

    const completeResponse = await request(`/api/matches/${match.id}`, {
      method: "PATCH",
      body: {
        status: "completed",
        endedAt: "2026-05-10T12:30:00.000Z",
        score: {
          red: 1,
          blue: 0
        }
      }
    });

    expect(completeResponse.status).toBe(200);

    const accountOnlyResponse = await request("/api/matches/metrics/query", {
      method: "POST",
      body: {
        schema: {
          name: schemaName
        },
        language: "pt",
        metrics: ["points", "assists", "contributions"],
        sort: [
          {
            type: "metric",
            key: "points",
            direction: "desc"
          },
          {
            type: "field",
            key: "name",
            direction: "asc"
          }
        ],
        page: {
          limit: 10
        }
      }
    });

    expect(accountOnlyResponse.status).toBe(200);

    const accountOnly = await accountOnlyResponse.json();

    expect(accountOnly.items).toEqual([
      expect.objectContaining({
        rank: 1,
        group: expect.objectContaining({
          type: "account",
          id: account.uuid,
          name: account.name
        }),
        metrics: {
          points: 5,
          assists: 2,
          contributions: 4
        },
        contribution: {
          matchesCount: 1,
          eventsCount: 3,
          playersCount: 2
        }
      })
    ]);
    expect(accountOnly.meta.availableMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "goals",
          label: "Gols"
        }),
        expect.objectContaining({
          key: "points",
          label: "Points"
        })
      ])
    );

    const hybridResponse = await request("/api/matches/metrics/query", {
      method: "POST",
      body: {
        schema: {
          id: schema.id,
          version: schema.version
        },
        group: {
          by: "account-or-player"
        },
        sort: [
          {
            type: "metric",
            key: "points",
            direction: "desc"
          }
        ]
      }
    });

    expect(hybridResponse.status).toBe(200);

    const hybrid = await hybridResponse.json();

    expect(
      hybrid.items.map((item: { group: { type: string } }) => item.group.type)
    ).toEqual(["account", "player"]);
    expect(hybrid.items[1]).toMatchObject({
      group: {
        type: "player",
        id: guestPlayer.id,
        name: guestPlayer.name
      },
      metrics: expect.objectContaining({
        points: 4
      })
    });
  });

  it("disables events only after completion and excludes them from metrics", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `disable-stat-${crypto.randomUUID()}`,
        name: "disable-stat"
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const matchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(matchResponse.status).toBe(201);

    const match: MatchResponse = await matchResponse.json();

    expect(match.eventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const addResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        type: "goal",
        domain: "game",
        scope: "player",
        actorPlayerId: player.id,
        value: 5
      }
    });
    const keptResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        type: "goal",
        domain: "game",
        scope: "player",
        actorPlayerId: player.id,
        value: 2
      }
    });

    expect(addResponse.status).toBe(201);
    expect(keptResponse.status).toBe(201);

    const event = await addResponse.json();
    const ongoingDisableResponse = await request(
      `/api/matches/${match.id}/events/${event.id}`,
      {
        method: "PATCH",
        body: {
          disabled: true
        }
      }
    );

    expect(ongoingDisableResponse.status).toBe(400);

    const completeResponse = await request(`/api/matches/${match.id}`, {
      method: "PATCH",
      body: {
        status: "completed",
        endedAt: "2026-05-10T12:30:00.000Z",
        score: {
          red: 1,
          blue: 0
        }
      }
    });

    expect(completeResponse.status).toBe(200);

    const disableResponse = await request(
      `/api/matches/${match.id}/events/${event.id}`,
      {
        method: "PATCH",
        body: {
          disabled: true
        }
      }
    );

    expect(disableResponse.status).toBe(200);
    expect(await disableResponse.json()).toMatchObject({
      id: event.id,
      disabled: true,
      disabledAt: expect.any(String)
    });

    const secondDisableResponse = await request(
      `/api/matches/${match.id}/events/${event.id}`,
      {
        method: "PATCH",
        body: {
          disabled: true
        }
      }
    );
    const listResponse = await request(`/api/matches/${match.id}/events`);
    const missingDisableResponse = await request(
      `/api/matches/${match.id}/events/00000000-0000-4000-8000-000000000000`,
      {
        method: "PATCH",
        body: {
          disabled: true
        }
      }
    );

    expect(secondDisableResponse.status).toBe(200);
    expect(await secondDisableResponse.json()).toMatchObject({
      id: event.id,
      disabled: true
    });
    expect(listResponse.status).toBe(200);
    expect(await paginatedItems(listResponse)).toContainEqual(
      expect.objectContaining({
        id: event.id,
        disabled: true
      })
    );
    expect(missingDisableResponse.status).toBe(404);

    const metricsResponse = await request(`/api/matches/${match.id}/metrics`);

    expect(metricsResponse.status).toBe(200);
    expect(await metricsResponse.json()).toEqual([
      {
        player: expect.objectContaining({
          id: player.id
        }),
        metrics: {
          goals: 1,
          points: 2,
          contributions: 1
        }
      }
    ]);
  });

  it("rejects invalid event writes", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `invalid-stat-${crypto.randomUUID()}`,
        name: "invalid-stat"
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const unboundMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing"
      }
    });

    expect(unboundMatchResponse.status).toBe(201);

    const unboundMatch: MatchResponse = await unboundMatchResponse.json();
    const unboundResponse = await request(
      `/api/matches/${unboundMatch.id}/events`,
      {
        method: "POST",
        body: {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: player.id,
          value: 1
        }
      }
    );

    expect(unboundResponse.status).toBe(400);
    expect(await unboundResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Match does not have an event schema"
      }
    });

    const matchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(matchResponse.status).toBe(201);

    const match: MatchResponse = await matchResponse.json();

    expect(match.eventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const unknownTypeResponse = await request(
      `/api/matches/${match.id}/events`,
      {
        method: "POST",
        body: {
          type: "steal",
          domain: "game",
          scope: "player",
          actorPlayerId: player.id,
          value: 1
        }
      }
    );
    const invalidValueResponse = await request(
      `/api/matches/${match.id}/events`,
      {
        method: "POST",
        body: {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: player.id,
          value: "one"
        }
      }
    );
    const unknownPlayerResponse = await request(
      `/api/matches/${match.id}/events`,
      {
        method: "POST",
        body: {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: "missing-player",
          value: 1
        }
      }
    );

    expect(unknownTypeResponse.status).toBe(400);
    expect(invalidValueResponse.status).toBe(400);
    expect(unknownPlayerResponse.status).toBe(404);
  });

  it("validates event value schema constraints", async () => {
    const schemaDefinition = {
      events: [
        {
          type: "text-value",
          valueSchema: {
            type: "string",
            minLength: 2,
            maxLength: 4
          }
        },
        {
          type: "flag-value",
          valueSchema: {
            type: "boolean"
          }
        },
        {
          type: "null-value",
          valueSchema: {
            type: "null"
          }
        },
        {
          type: "array-value",
          valueSchema: {
            type: "array",
            items: {
              type: "number",
              minimum: 0,
              maximum: 10
            }
          }
        },
        {
          type: "object-value",
          valueSchema: {
            type: "object",
            required: ["amount"],
            properties: {
              amount: {
                type: "number",
                minimum: 1,
                maximum: 10
              },
              tag: {
                type: "string"
              }
            }
          }
        },
        {
          type: "enum-value",
          valueSchema: {
            enum: ["red", "green"]
          }
        }
      ]
    };
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: schemaDefinition
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `value-schema-${crypto.randomUUID()}`,
        name: "value-schema"
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const matchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(matchResponse.status).toBe(201);

    const match: MatchResponse = await matchResponse.json();

    expect(match.eventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const validInputs = [
      {
        type: "text-value",
        value: "abc"
      },
      {
        type: "flag-value",
        value: true
      },
      {
        type: "null-value",
        value: null
      },
      {
        type: "array-value",
        value: [1, 2, 3]
      },
      {
        type: "object-value",
        value: {
          amount: 2,
          tag: "ok"
        }
      },
      {
        type: "enum-value",
        value: "red"
      }
    ];

    for (const input of validInputs) {
      const response = await request(`/api/matches/${match.id}/events`, {
        method: "POST",
        body: {
          ...input,
          domain: "game",
          scope: "player",
          actorPlayerId: player.id
        }
      });

      expect(response.status).toBe(201);
    }

    const invalidInputs = [
      {
        type: "text-value",
        value: "a"
      },
      {
        type: "array-value",
        value: [1, "bad"]
      },
      {
        type: "object-value",
        value: {
          tag: "missing-amount"
        }
      },
      {
        type: "object-value",
        value: {
          amount: 11
        }
      },
      {
        type: "enum-value",
        value: "blue"
      }
    ];

    for (const input of invalidInputs) {
      const response = await request(`/api/matches/${match.id}/events`, {
        method: "POST",
        body: {
          ...input,
          domain: "game",
          scope: "player",
          actorPlayerId: player.id
        }
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "BAD_REQUEST",
          message: "Event value does not match the schema"
        }
      });
    }
  });

  it("evaluates metric expression operators", async () => {
    const schemaDefinition = {
      events: [
        {
          type: "number-sample",
          valueSchema: {
            type: "number"
          },
          aggregations: [
            {
              target: "actor",
              metric: "sum",
              initial: 0,
              step: {
                op: "add",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
              target: "actor",
              metric: "difference",
              initial: 10,
              step: {
                op: "subtract",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
              target: "actor",
              metric: "product",
              initial: 1,
              step: {
                op: "multiply",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
              target: "actor",
              metric: "quotient",
              initial: 12,
              step: {
                op: "divide",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
              target: "actor",
              metric: "division-by-zero",
              initial: 10,
              step: {
                op: "divide",
                args: [{ path: "acc" }, 0]
              }
            },
            {
              target: "actor",
              metric: "values",
              initial: [],
              step: {
                op: "append",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
              target: "actor",
              metric: "large-count",
              initial: 0,
              step: {
                op: "if",
                args: [
                  {
                    op: "gt",
                    args: [{ path: "event.value" }, 2]
                  }
                ],
                then: {
                  op: "add",
                  args: [{ path: "acc" }, 1]
                },
                else: {
                  path: "acc"
                }
              }
            }
          ]
        }
      ],
      virtualMetrics: [
        {
          metric: "value-count",
          value: {
            op: "length",
            args: [{ path: "metrics.values" }]
          }
        },
        {
          metric: "has-high-impact",
          value: {
            op: "and",
            args: [
              {
                op: "gte",
                args: [{ path: "metrics.sum" }, 5]
              },
              {
                op: "not",
                args: [
                  {
                    op: "lt",
                    args: [{ path: "metrics.product" }, 6]
                  }
                ]
              }
            ]
          }
        },
        {
          metric: "fallback",
          value: {
            op: "coalesce",
            args: [{ path: "metrics.missing" }, "fallback"]
          }
        },
        {
          metric: "sum-is-five",
          value: {
            op: "eq",
            args: [{ path: "metrics.sum" }, 5]
          }
        },
        {
          metric: "sum-within-limit",
          value: {
            op: "lte",
            args: [{ path: "metrics.sum" }, 5]
          }
        },
        {
          metric: "has-any",
          value: {
            op: "or",
            args: [
              false,
              {
                op: "eq",
                args: [{ path: "metrics.product" }, 6]
              }
            ]
          }
        }
      ]
    };
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: schemaDefinition
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `operator-metrics-${crypto.randomUUID()}`,
        name: "operator-metrics"
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const matchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(matchResponse.status).toBe(201);

    const match: MatchResponse = await matchResponse.json();

    expect(match.eventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const firstResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        type: "number-sample",
        domain: "game",
        scope: "player",
        actorPlayerId: player.id,
        value: 2
      }
    });
    const secondResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        type: "number-sample",
        domain: "game",
        scope: "player",
        actorPlayerId: player.id,
        value: 3
      }
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const response = await request(`/api/matches/${match.id}/metrics`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        player: expect.objectContaining({
          id: player.id
        }),
        metrics: {
          difference: 5,
          "division-by-zero": null,
          fallback: "fallback",
          "has-any": true,
          "has-high-impact": true,
          "large-count": 1,
          product: 6,
          quotient: 2,
          sum: 5,
          "sum-is-five": true,
          "sum-within-limit": true,
          "value-count": 2,
          values: [2, 3]
        }
      }
    ]);
  });

  it("assigns a schema to an existing match before events exist", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `late-schema-${crypto.randomUUID()}`,
        name: "late-schema"
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing"
      }
    });

    expect(createResponse.status).toBe(201);

    const createdMatch: MatchResponse = await createResponse.json();
    const updateResponse = await request(`/api/matches/${createdMatch.id}`, {
      method: "PATCH",
      body: {
        eventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(updateResponse.status).toBe(200);

    const updatedMatch: MatchResponse = await updateResponse.json();

    expect(updatedMatch.eventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const eventResponse = await request(
      `/api/matches/${updatedMatch.id}/events`,
      {
        method: "POST",
        body: {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: player.id,
          value: 1
        }
      }
    );

    expect(eventResponse.status).toBe(201);
  });

  it("rejects unknown match schema bindings", async () => {
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: "00000000-0000-4000-8000-000000000000",
          version: 1
        }
      }
    });
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });

    expect(schemaResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const unknownVersionResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: schema.id,
          version: 99
        }
      }
    });

    expect(createResponse.status).toBe(404);
    expect(unknownVersionResponse.status).toBe(404);
  });

  it("does not allow changing a match schema after events exist", async () => {
    const schemaResponse = await request("/api/event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: `schema-lock-${crypto.randomUUID()}`,
        name: "schema-lock"
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: EventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const matchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        eventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(matchResponse.status).toBe(201);

    const match: MatchResponse = await matchResponse.json();

    expect(match.eventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const eventResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        type: "goal",
        domain: "game",
        scope: "player",
        actorPlayerId: player.id,
        value: 1
      }
    });

    expect(eventResponse.status).toBe(201);

    const publishResponse = await request(
      `/api/event-schemas/${schema.id}/versions`,
      {
        method: "POST",
        body: {
          definition: {
            events: [baseDefinition().events[0]]
          }
        }
      }
    );

    expect(publishResponse.status).toBe(201);

    const nextVersion: EventSchemaResponse = await publishResponse.json();
    const updateResponse = await request(`/api/matches/${match.id}`, {
      method: "PATCH",
      body: {
        eventSchema: {
          id: nextVersion.id,
          version: nextVersion.version
        }
      }
    });

    expect(updateResponse.status).toBe(400);
    expect(await updateResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Match event schema cannot be changed after events exist"
      }
    });
  });
});

function baseDefinition() {
  return {
    events: [
      {
        type: "goal",
        valueSchema: {
          type: "number",
          minimum: 0
        },
        aggregations: [
          {
            target: "actor",
            metric: "goals",
            initial: 0,
            step: {
              op: "add",
              args: [
                {
                  path: "acc"
                },
                1
              ]
            }
          },
          {
            target: "actor",
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
      },
      {
        type: "assist",
        valueSchema: {
          type: "object",
          required: ["amount"],
          properties: {
            amount: {
              type: "number",
              minimum: 0
            }
          }
        },
        aggregations: [
          {
            target: "actor",
            metric: "assists",
            initial: 0,
            step: {
              op: "add",
              args: [
                {
                  path: "acc"
                },
                {
                  path: "event.value.amount"
                }
              ]
            }
          }
        ]
      },
      {
        type: "note",
        valueSchema: {
          type: "string",
          minLength: 1
        }
      }
    ],
    virtualMetrics: [
      {
        metric: "contributions",
        value: {
          op: "add",
          args: [
            {
              path: "metrics.goals"
            },
            {
              path: "metrics.assists"
            }
          ]
        }
      }
    ]
  };
}

function metadataDefinition(metricLabelPrefix = "metric") {
  return {
    ...baseDefinition(),
    metrics: [
      {
        key: "goals",
        label: `${metricLabelPrefix}.goals`,
        valueType: "number",
        format: "integer"
      },
      {
        key: "points",
        label: `${metricLabelPrefix}.points`,
        valueType: "number",
        format: "integer"
      },
      {
        key: "assists",
        label: `${metricLabelPrefix}.assists`,
        valueType: "number",
        format: "integer"
      },
      {
        key: "contributions",
        label: `${metricLabelPrefix}.contributions`,
        valueType: "number",
        format: "integer"
      }
    ]
  };
}

function uniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function uniqueDiscordId(): string {
  return `9${crypto
    .randomUUID()
    .replaceAll(/[^0-9]/g, "")
    .padEnd(17, "0")
    .slice(0, 17)}`;
}
