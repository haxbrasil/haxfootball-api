import { describe, expect, it } from "bun:test";
import { paginatedItems, request } from "@/test/e2e/helpers/helpers";

type JsonObject = Record<string, unknown>;

type MatchResponse = {
  id: string;
  statEventSchema: {
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
};

type StatEventSchemaResponse = {
  id: string;
  name: string;
  title: string;
  version: number;
  isLatest: boolean;
  definition: JsonObject;
  createdAt: string;
  updatedAt: string;
};

describe("stat event schemas", () => {
  it("creates, lists, gets, and updates the latest schema version", async () => {
    const createResponse = await request("/api/stat-event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("match-stats"),
        title: "Match Stats",
        definition: baseDefinition()
      }
    });

    expect(createResponse.status).toBe(201);

    const schema: StatEventSchemaResponse = await createResponse.json();
    const schemaId = schema.id;

    expect(schema.id).toEqual(expect.any(String));
    expect(schema.name).toEqual(expect.stringMatching(/^match-stats-/));
    expect(schema.title).toBe("Match Stats");
    expect(schema.version).toBe(1);
    expect(schema.isLatest).toBe(true);
    expect(schema.definition).toEqual(baseDefinition());
    expect(schema.createdAt).toEqual(expect.any(String));
    expect(schema.updatedAt).toEqual(expect.any(String));

    const listResponse = await request("/api/stat-event-schemas");

    expect(listResponse.status).toBe(200);
    expect(await paginatedItems(listResponse)).toContainEqual(schema);

    const getResponse = await request(`/api/stat-event-schemas/${schemaId}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(schema);

    const updateResponse = await request(
      `/api/stat-event-schemas/${schema.id}/versions/1`,
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

    const updated: StatEventSchemaResponse = await updateResponse.json();

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
    const schemaResponse = await request("/api/stat-event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });

    expect(schemaResponse.status).toBe(201);

    const schema: StatEventSchemaResponse = await schemaResponse.json();
    const breakingDefinition = {
      events: [baseDefinition().events[0]]
    };

    const updateResponse = await request(
      `/api/stat-event-schemas/${schema.id}/versions/1`,
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
      `/api/stat-event-schemas/${schema.id}/versions`,
      {
        method: "POST",
        body: {
          definition: breakingDefinition
        }
      }
    );

    expect(publishResponse.status).toBe(201);

    const version: StatEventSchemaResponse = await publishResponse.json();

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
      }
    ];

    for (const definition of invalidDefinitions) {
      const response = await request("/api/stat-event-schemas", {
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
          message: "Invalid stat event schema definition"
        }
      });
    }
  });

  it("allows additive latest updates and rejects updates to old versions", async () => {
    const schemaResponse = await request("/api/stat-event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });

    expect(schemaResponse.status).toBe(201);

    const schema: StatEventSchemaResponse = await schemaResponse.json();
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
      `/api/stat-event-schemas/${schema.id}/versions/1`,
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
      `/api/stat-event-schemas/${schema.id}/versions`,
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
      `/api/stat-event-schemas/${schema.id}/versions/1`,
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
        message: "Only the latest stat event schema version can be updated"
      }
    });
  });

  it("keeps old matches bound to their original schema version", async () => {
    const schemaResponse = await request("/api/stat-event-schemas", {
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

    const schema: StatEventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const oldMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        statEventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(oldMatchResponse.status).toBe(201);

    const oldMatch: MatchResponse = await oldMatchResponse.json();

    expect(oldMatch.statEventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const publishResponse = await request(
      `/api/stat-event-schemas/${schema.id}/versions`,
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

    const nextVersion: StatEventSchemaResponse = await publishResponse.json();
    const oldMatchAssistResponse = await request(
      `/api/matches/${oldMatch.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "assist",
          playerId: player.id,
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
        statEventSchema: {
          id: nextVersion.id,
          version: nextVersion.version
        }
      }
    });

    expect(newMatchResponse.status).toBe(201);

    const newMatch: MatchResponse = await newMatchResponse.json();

    expect(newMatch.statEventSchema).toEqual({
      id: nextVersion.id,
      version: nextVersion.version
    });

    const newMatchAssistResponse = await request(
      `/api/matches/${newMatch.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "assist",
          playerId: player.id,
          value: {
            amount: 1
          }
        }
      }
    );

    expect(oldMatchAssistResponse.status).toBe(201);
    expect(newMatchAssistResponse.status).toBe(400);
  });
});

describe("match stat events", () => {
  it("adds stat events to a schema-bound ongoing match and derives metrics", async () => {
    const schemaResponse = await request("/api/stat-event-schemas", {
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

    const schema: StatEventSchemaResponse = await schemaResponse.json();
    const firstPlayer: PlayerResponse = await firstPlayerResponse.json();
    const secondPlayer: PlayerResponse = await secondPlayerResponse.json();
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

    const match: MatchResponse = await matchResponse.json();

    expect(match.statEventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const firstGoalResponse = await request(
      `/api/matches/${match.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "goal",
          playerId: firstPlayer.id,
          value: 3,
          occurredAt: "2026-05-10T12:01:00.000Z",
          tick: 120
        }
      }
    );
    const assistResponse = await request(
      `/api/matches/${match.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "assist",
          playerId: firstPlayer.id,
          value: {
            amount: 2
          }
        }
      }
    );
    const noteResponse = await request(`/api/matches/${match.id}/stat-events`, {
      method: "POST",
      body: {
        type: "note",
        playerId: secondPlayer.id,
        value: "saved"
      }
    });

    expect(firstGoalResponse.status).toBe(201);
    expect(assistResponse.status).toBe(201);
    expect(noteResponse.status).toBe(201);

    expect(await firstGoalResponse.json()).toMatchObject({
      sequence: 1,
      type: "goal",
      player: {
        id: firstPlayer.id
      },
      value: 3,
      occurredAt: "2026-05-10T12:01:00.000Z",
      tick: 120,
      disabled: false
    });

    const listResponse = await request(`/api/matches/${match.id}/stat-events`);

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

  it("disables stat events only after completion and excludes them from metrics", async () => {
    const schemaResponse = await request("/api/stat-event-schemas", {
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

    const schema: StatEventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
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

    const match: MatchResponse = await matchResponse.json();

    expect(match.statEventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const addResponse = await request(`/api/matches/${match.id}/stat-events`, {
      method: "POST",
      body: {
        type: "goal",
        playerId: player.id,
        value: 5
      }
    });
    const keptResponse = await request(`/api/matches/${match.id}/stat-events`, {
      method: "POST",
      body: {
        type: "goal",
        playerId: player.id,
        value: 2
      }
    });

    expect(addResponse.status).toBe(201);
    expect(keptResponse.status).toBe(201);

    const event = await addResponse.json();
    const ongoingDisableResponse = await request(
      `/api/matches/${match.id}/stat-events/${event.id}`,
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
      `/api/matches/${match.id}/stat-events/${event.id}`,
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
      `/api/matches/${match.id}/stat-events/${event.id}`,
      {
        method: "PATCH",
        body: {
          disabled: true
        }
      }
    );
    const listResponse = await request(`/api/matches/${match.id}/stat-events`);
    const missingDisableResponse = await request(
      `/api/matches/${match.id}/stat-events/00000000-0000-4000-8000-000000000000`,
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

  it("rejects invalid stat event writes", async () => {
    const schemaResponse = await request("/api/stat-event-schemas", {
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

    const schema: StatEventSchemaResponse = await schemaResponse.json();
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
      `/api/matches/${unboundMatch.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "goal",
          playerId: player.id,
          value: 1
        }
      }
    );

    expect(unboundResponse.status).toBe(400);
    expect(await unboundResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Match does not have a stat event schema"
      }
    });

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

    const match: MatchResponse = await matchResponse.json();

    expect(match.statEventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const unknownTypeResponse = await request(
      `/api/matches/${match.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "steal",
          playerId: player.id,
          value: 1
        }
      }
    );
    const invalidValueResponse = await request(
      `/api/matches/${match.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "goal",
          playerId: player.id,
          value: "one"
        }
      }
    );
    const unknownPlayerResponse = await request(
      `/api/matches/${match.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "goal",
          playerId: "missing-player",
          value: 1
        }
      }
    );

    expect(unknownTypeResponse.status).toBe(400);
    expect(invalidValueResponse.status).toBe(400);
    expect(unknownPlayerResponse.status).toBe(404);
  });

  it("validates stat event value schema constraints", async () => {
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
    const schemaResponse = await request("/api/stat-event-schemas", {
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

    const schema: StatEventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
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

    const match: MatchResponse = await matchResponse.json();

    expect(match.statEventSchema).toEqual({
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
      const response = await request(`/api/matches/${match.id}/stat-events`, {
        method: "POST",
        body: {
          ...input,
          playerId: player.id
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
      const response = await request(`/api/matches/${match.id}/stat-events`, {
        method: "POST",
        body: {
          ...input,
          playerId: player.id
        }
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "BAD_REQUEST",
          message: "Stat event value does not match the schema"
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
              metric: "sum",
              initial: 0,
              step: {
                op: "add",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
              metric: "difference",
              initial: 10,
              step: {
                op: "subtract",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
              metric: "product",
              initial: 1,
              step: {
                op: "multiply",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
              metric: "quotient",
              initial: 12,
              step: {
                op: "divide",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
              metric: "division-by-zero",
              initial: 10,
              step: {
                op: "divide",
                args: [{ path: "acc" }, 0]
              }
            },
            {
              metric: "values",
              initial: [],
              step: {
                op: "append",
                args: [{ path: "acc" }, { path: "event.value" }]
              }
            },
            {
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
    const schemaResponse = await request("/api/stat-event-schemas", {
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

    const schema: StatEventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
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

    const match: MatchResponse = await matchResponse.json();

    expect(match.statEventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const firstResponse = await request(
      `/api/matches/${match.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "number-sample",
          playerId: player.id,
          value: 2
        }
      }
    );
    const secondResponse = await request(
      `/api/matches/${match.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "number-sample",
          playerId: player.id,
          value: 3
        }
      }
    );

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

  it("assigns a schema to an existing match before stat events exist", async () => {
    const schemaResponse = await request("/api/stat-event-schemas", {
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

    const schema: StatEventSchemaResponse = await schemaResponse.json();
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
        statEventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(updateResponse.status).toBe(200);

    const updatedMatch: MatchResponse = await updateResponse.json();

    expect(updatedMatch.statEventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const eventResponse = await request(
      `/api/matches/${updatedMatch.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "goal",
          playerId: player.id,
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
        statEventSchema: {
          id: "00000000-0000-4000-8000-000000000000",
          version: 1
        }
      }
    });
    const schemaResponse = await request("/api/stat-event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("schema"),
        definition: baseDefinition()
      }
    });

    expect(schemaResponse.status).toBe(201);

    const schema: StatEventSchemaResponse = await schemaResponse.json();
    const unknownVersionResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        statEventSchema: {
          id: schema.id,
          version: 99
        }
      }
    });

    expect(createResponse.status).toBe(404);
    expect(unknownVersionResponse.status).toBe(404);
  });

  it("does not allow changing a match schema after stat events exist", async () => {
    const schemaResponse = await request("/api/stat-event-schemas", {
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

    const schema: StatEventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
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

    const match: MatchResponse = await matchResponse.json();

    expect(match.statEventSchema).toEqual({
      id: schema.id,
      version: schema.version
    });

    const eventResponse = await request(
      `/api/matches/${match.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "goal",
          playerId: player.id,
          value: 1
        }
      }
    );

    expect(eventResponse.status).toBe(201);

    const publishResponse = await request(
      `/api/stat-event-schemas/${schema.id}/versions`,
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

    const nextVersion: StatEventSchemaResponse = await publishResponse.json();
    const updateResponse = await request(`/api/matches/${match.id}`, {
      method: "PATCH",
      body: {
        statEventSchema: {
          id: nextVersion.id,
          version: nextVersion.version
        }
      }
    });

    expect(updateResponse.status).toBe(400);
    expect(await updateResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message:
          "Match stat event schema cannot be changed after stat events exist"
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

function uniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
