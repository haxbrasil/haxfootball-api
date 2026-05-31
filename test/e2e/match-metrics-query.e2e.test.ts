import { describe, expect, it } from "bun:test";
import { request } from "@/test/e2e/helpers/helpers";

type AccountResponse = {
  uuid: string;
  name: string;
};

type MatchResponse = {
  id: string;
};

type PlayerResponse = {
  id: string;
  name: string;
};

type EventSchemaResponse = {
  id: string;
  name: string;
  version: number;
};

type MetricsQueryItem = {
  rank: number;
  group: {
    type: "account" | "player";
    id: string;
    name: string;
  };
  metrics: Record<string, unknown>;
  contribution: {
    matchesCount: number;
    eventsCount: number;
    playersCount: number;
  };
};

type MetricsQueryResponse = {
  items: MetricsQueryItem[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
  meta: {
    schema: {
      id: string;
      name: string;
      version: number;
      isLatest: boolean;
    };
    featuredMetrics: {
      points?: string;
    };
    availableMetrics: Array<{
      key: string;
      label: string;
      description: string | null;
    }>;
    totals: {
      groupsCount: number;
      matchesCount: number;
      eventsCount: number;
    };
  };
};

describe("match metrics query", () => {
  it("uses explicit schema selection and latest version resolution", async () => {
    const schema = await createSchema("metrics-version", analyticsDefinition());
    const player = await createPlayer("version-player");
    const firstMatch = await createMatchWithEvents({
      schema,
      events: [
        {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: player.id,
          value: 5
        }
      ]
    });

    expect(firstMatch.id).toEqual(expect.any(String));

    const publishResponse = await request(
      `/api/event-schemas/${schema.id}/versions`,
      {
        method: "POST",
        body: {
          definition: {
            events: [analyticsDefinition().events[0]],
            metrics: [
              {
                key: "goals",
                label: "metric.goals"
              },
              {
                key: "points",
                label: "metric.points"
              }
            ]
          }
        }
      }
    );

    expect(publishResponse.status).toBe(201);

    const latest: EventSchemaResponse = await publishResponse.json();
    const latestQuery = await queryMetrics({
      schema: {
        name: schema.name
      },
      group: {
        by: "player"
      }
    });
    const firstVersionQuery = await queryMetrics({
      schema: {
        name: schema.name,
        version: schema.version
      },
      group: {
        by: "player"
      }
    });

    expect(latestQuery.meta.schema).toMatchObject({
      id: schema.id,
      name: schema.name,
      version: latest.version,
      isLatest: true
    });
    expect(latestQuery.items).toEqual([]);
    expect(firstVersionQuery.meta.schema).toMatchObject({
      id: schema.id,
      name: schema.name,
      version: schema.version,
      isLatest: false
    });
    expect(firstVersionQuery.items).toHaveLength(1);
  });

  it("applies grouping modes, status defaults, filters, selected metrics, and localized labels", async () => {
    const schema = await createSchema("metrics-filters", analyticsDefinition());
    const account = await createAccount("FilterAcct");
    const firstPlayer = await createPlayer("filter-first");
    const secondPlayer = await createPlayer("filter-second");
    const guestPlayer = await createPlayer("filter-guest");

    await associatePlayer(firstPlayer, account);
    await associatePlayer(secondPlayer, account);
    await upsertMetricLabels();

    const completedMatch = await createMatchWithEvents({
      schema,
      initiatedAt: "2026-01-10T12:00:00.000Z",
      endedAt: "2026-01-10T12:30:00.000Z",
      events: [
        {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: firstPlayer.id,
          value: 5
        },
        {
          type: "assist",
          domain: "game",
          scope: "player",
          actorPlayerId: secondPlayer.id,
          value: {
            amount: 2
          }
        },
        {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: guestPlayer.id,
          value: 7
        },
        {
          type: "note",
          domain: "game",
          scope: "player",
          actorPlayerId: guestPlayer.id,
          value: "ignored"
        }
      ]
    });
    const ongoingMatch = await createMatchWithEvents({
      schema,
      status: "ongoing",
      initiatedAt: "2026-01-11T12:00:00.000Z",
      events: [
        {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: firstPlayer.id,
          value: 11
        }
      ]
    });

    const defaultQuery = await queryMetrics({
      schema: {
        id: schema.id
      },
      language: "pt",
      metrics: ["points", "assists", "total"],
      sort: [
        {
          type: "metric",
          key: "points",
          direction: "desc"
        }
      ]
    });

    expect(defaultQuery.items).toEqual([
      expect.objectContaining({
        group: expect.objectContaining({
          type: "account",
          id: account.uuid
        }),
        metrics: {
          points: 5,
          assists: 2,
          total: 8
        },
        contribution: {
          matchesCount: 1,
          eventsCount: 2,
          playersCount: 2
        }
      })
    ]);
    expect(metricLabel(defaultQuery, "points")).toBe("Pontos");
    expect(metricDescription(defaultQuery, "points")).toBe("Total de pontos");
    expect(metricLabel(defaultQuery, "total")).toBe("metric.total");
    expect(defaultQuery.meta.featuredMetrics).toEqual({
      points: "total"
    });

    const withOngoing = await queryMetrics({
      schema: {
        id: schema.id
      },
      filters: {
        statuses: ["completed", "ongoing"]
      },
      metrics: ["points"]
    });

    expect(withOngoing.items[0]).toMatchObject({
      metrics: {
        points: 16
      },
      contribution: {
        matchesCount: 2,
        eventsCount: 3,
        playersCount: 2
      }
    });

    const matchFilter = await queryMetrics({
      schema: {
        id: schema.id
      },
      filters: {
        statuses: ["ongoing"],
        matchIds: [ongoingMatch.id]
      },
      metrics: ["points"]
    });

    expect(matchFilter.items[0].metrics).toEqual({
      points: 11
    });

    const periodFilter = await queryMetrics({
      schema: {
        id: schema.id
      },
      filters: {
        period: {
          field: "initiatedAt",
          from: "2026-01-10T00:00:00.000Z",
          to: "2026-01-10T23:59:59.999Z"
        }
      },
      metrics: ["points"]
    });

    expect(periodFilter.meta.totals.matchesCount).toBe(1);
    expect(periodFilter.items[0].metrics).toEqual({
      points: 5
    });

    const accountFilter = await queryMetrics({
      schema: {
        id: schema.id
      },
      filters: {
        accountIds: [account.uuid]
      },
      metrics: ["points"]
    });
    const playerFilter = await queryMetrics({
      schema: {
        id: schema.id
      },
      filters: {
        playerIds: [secondPlayer.id]
      },
      group: {
        by: "player"
      },
      metrics: ["assists"]
    });
    const eventTypeFilter = await queryMetrics({
      schema: {
        id: schema.id
      },
      filters: {
        eventTypes: ["assist"]
      },
      metrics: ["assists"]
    });

    expect(accountFilter.items[0].metrics).toEqual({
      points: 5
    });
    expect(playerFilter.items).toEqual([
      expect.objectContaining({
        group: expect.objectContaining({
          type: "player",
          id: secondPlayer.id
        }),
        metrics: {
          assists: 2
        }
      })
    ]);
    expect(eventTypeFilter.items[0]).toMatchObject({
      metrics: {
        assists: 2
      },
      contribution: {
        eventsCount: 1
      }
    });

    const playerGroup = await queryMetrics({
      schema: {
        id: schema.id
      },
      group: {
        by: "player"
      },
      sort: [
        {
          type: "field",
          key: "name",
          direction: "asc"
        }
      ],
      metrics: ["points", "assists"]
    });
    const hybridGroup = await queryMetrics({
      schema: {
        id: schema.id
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
      ],
      metrics: ["points"]
    });

    expect(playerGroup.items.map((item) => item.group.type)).toEqual([
      "player",
      "player",
      "player"
    ]);
    expect(playerGroup.items.map((item) => item.group.id).sort()).toEqual(
      [firstPlayer.id, secondPlayer.id, guestPlayer.id].sort()
    );
    expect(hybridGroup.items.map((item) => item.group.type)).toEqual([
      "player",
      "account"
    ]);
    expect(hybridGroup.items[0]).toMatchObject({
      group: {
        id: guestPlayer.id
      },
      metrics: {
        points: 7
      }
    });

    expect(completedMatch.id).toEqual(expect.any(String));
  });

  it("uses current account identity for historical player stats", async () => {
    const schema = await createSchema("metrics-current-identity");
    const player = await createPlayer("identity-player");
    const match = await createMatchWithEvents({
      schema,
      events: [
        {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: player.id,
          value: 9
        }
      ]
    });
    const account = await createAccount("IdentityAcct");

    await associatePlayer(player, account);

    const response = await queryMetrics({
      schema: {
        id: schema.id
      },
      metrics: ["points"]
    });

    expect(response.items).toEqual([
      expect.objectContaining({
        group: expect.objectContaining({
          type: "account",
          id: account.uuid
        }),
        metrics: {
          points: 9
        }
      })
    ]);
    expect(match.id).toEqual(expect.any(String));
  });

  it("excludes disabled events from aggregate metrics", async () => {
    const schema = await createSchema("metrics-disabled");
    const account = await createAccount("DisabledAcct");
    const player = await createPlayer("disabled-player");

    await associatePlayer(player, account);

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
    const disabledEventResponse = await request(
      `/api/matches/${match.id}/events`,
      {
        method: "POST",
        body: {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: player.id,
          value: 20
        }
      }
    );
    const keptEventResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        type: "goal",
        domain: "game",
        scope: "player",
        actorPlayerId: player.id,
        value: 3
      }
    });

    expect(disabledEventResponse.status).toBe(201);
    expect(keptEventResponse.status).toBe(201);

    const disabledEvent = await disabledEventResponse.json();
    const completeResponse = await request(`/api/matches/${match.id}`, {
      method: "PATCH",
      body: {
        status: "completed",
        endedAt: "2026-01-10T12:30:00.000Z",
        score: {
          red: 1,
          blue: 0
        }
      }
    });

    expect(completeResponse.status).toBe(200);

    const disableResponse = await request(
      `/api/matches/${match.id}/events/${disabledEvent.id}`,
      {
        method: "PATCH",
        body: {
          disabled: true
        }
      }
    );

    expect(disableResponse.status).toBe(200);

    const response = await queryMetrics({
      schema: {
        id: schema.id
      },
      metrics: ["points", "goals"]
    });

    expect(response.items[0]).toMatchObject({
      metrics: {
        points: 3,
        goals: 1
      },
      contribution: {
        eventsCount: 1
      }
    });
  });

  it("sorts by multiple keys and paginates with stable ranks", async () => {
    const schema = await createSchema("metrics-pagination");
    const first = await createAccountWithPlayer("Alpha");
    const second = await createAccountWithPlayer("Beta");
    const third = await createAccountWithPlayer("Gamma");

    await createMatchWithEvents({
      schema,
      events: [
        {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: first.player.id,
          value: 10
        },
        {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: second.player.id,
          value: 10
        },
        {
          type: "goal",
          domain: "game",
          scope: "player",
          actorPlayerId: third.player.id,
          value: 4
        }
      ]
    });

    const firstPage = await queryMetrics({
      schema: {
        id: schema.id
      },
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
        limit: 2
      },
      metrics: ["points"]
    });

    expect(firstPage.items.map((item) => item.rank)).toEqual([1, 2]);
    expect(firstPage.items.map((item) => item.group.name)).toEqual([
      first.account.name,
      second.account.name
    ]);
    expect(firstPage.page.nextCursor).toEqual(expect.any(String));

    const secondPage = await queryMetrics({
      schema: {
        id: schema.id
      },
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
        limit: 2,
        cursor: firstPage.page.nextCursor
      },
      metrics: ["points"]
    });

    expect(secondPage.items).toEqual([
      expect.objectContaining({
        rank: 3,
        group: expect.objectContaining({
          name: third.account.name
        }),
        metrics: {
          points: 4
        }
      })
    ]);
    expect(secondPage.page.nextCursor).toBeNull();
  });

  it("rejects invalid metrics query inputs and unknown requested keys", async () => {
    const schema = await createSchema("metrics-errors");
    const invalidResponses = await Promise.all([
      request("/api/matches/metrics/query", {
        method: "POST",
        body: {
          filters: {}
        }
      }),
      request("/api/matches/metrics/query", {
        method: "POST",
        body: {
          schema: {
            id: schema.id
          },
          metrics: ["missing-metric"]
        }
      }),
      request("/api/matches/metrics/query", {
        method: "POST",
        body: {
          schema: {
            id: schema.id
          },
          sort: [
            {
              type: "metric",
              key: "missing-metric",
              direction: "desc"
            }
          ]
        }
      }),
      request("/api/matches/metrics/query", {
        method: "POST",
        body: {
          schema: {
            id: schema.id
          },
          filters: {
            eventTypes: ["missing-event"]
          }
        }
      })
    ]);

    expect(invalidResponses[0].status).toBe(400);
    expect(await invalidResponses[0].json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });

    for (const response of invalidResponses.slice(1)) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "BAD_REQUEST"
        }
      });
    }
  });
});

async function createSchema(
  prefix: string,
  definition = analyticsDefinition()
): Promise<EventSchemaResponse> {
  const response = await request("/api/event-schemas", {
    method: "POST",
    body: {
      name: uniqueName(prefix),
      definition
    }
  });

  expect(response.status).toBe(201);

  return response.json();
}

async function createAccount(prefix: string): Promise<AccountResponse> {
  const response = await request("/api/accounts", {
    method: "POST",
    body: {
      name: uniqueAccountName(prefix),
      password: "pass1234",
      externalId: uniqueDiscordId()
    }
  });

  expect(response.status).toBe(201);

  return response.json();
}

async function createPlayer(prefix: string): Promise<PlayerResponse> {
  const response = await request("/api/players", {
    method: "POST",
    body: {
      externalId: `${prefix}-${crypto.randomUUID()}`,
      name: uniquePlayerName(prefix)
    }
  });

  expect(response.status).toBe(201);

  return response.json();
}

async function createAccountWithPlayer(prefix: string): Promise<{
  account: AccountResponse;
  player: PlayerResponse;
}> {
  const account = await createAccount(prefix);
  const player = await createPlayer(prefix);

  await associatePlayer(player, account);

  return { account, player };
}

async function associatePlayer(
  player: PlayerResponse,
  account: AccountResponse
): Promise<void> {
  const response = await request(`/api/players/${player.id}/account`, {
    method: "PATCH",
    body: {
      accountUuid: account.uuid
    }
  });

  expect(response.status).toBe(200);
}

async function createMatchWithEvents(input: {
  schema: EventSchemaResponse;
  status?: "completed" | "ongoing";
  initiatedAt?: string;
  endedAt?: string;
  events: Array<{
    type: string;
    domain: "game";
    scope: "player";
    actorPlayerId: string;
    value: unknown;
  }>;
}): Promise<MatchResponse> {
  const response = await request("/api/matches", {
    method: "POST",
    body: {
      status: "ongoing",
      initiatedAt: input.initiatedAt,
      eventSchema: {
        id: input.schema.id,
        version: input.schema.version
      }
    }
  });

  expect(response.status).toBe(201);

  const match: MatchResponse = await response.json();

  for (const event of input.events) {
    const eventResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: event
    });

    expect(eventResponse.status).toBe(201);
  }

  if (input.status !== "ongoing") {
    const completeResponse = await request(`/api/matches/${match.id}`, {
      method: "PATCH",
      body: {
        status: "completed",
        endedAt: input.endedAt ?? "2026-01-10T12:30:00.000Z",
        score: {
          red: 1,
          blue: 0
        }
      }
    });

    expect(completeResponse.status).toBe(200);
  }

  return match;
}

async function queryMetrics(body: unknown): Promise<MetricsQueryResponse> {
  const response = await request("/api/matches/metrics/query", {
    method: "POST",
    body
  });

  expect(response.status).toBe(200);

  return response.json();
}

async function upsertMetricLabels(): Promise<void> {
  const response = await request("/api/values/bulk", {
    method: "POST",
    body: {
      values: [
        {
          value: "metric.points",
          language: "pt",
          label: "Pontos"
        },
        {
          value: "metric.points.description",
          language: "pt",
          label: "Total de pontos"
        },
        {
          value: "metric.assists",
          language: "en",
          label: "Assists"
        }
      ]
    }
  });

  expect(response.status).toBe(200);
}

function metricLabel(response: MetricsQueryResponse, key: string): string {
  const metric = response.meta.availableMetrics.find(
    (metadata) => metadata.key === key
  );

  if (!metric) {
    throw new Error(`Expected metric metadata for ${key}`);
  }

  return metric.label;
}

function metricDescription(
  response: MetricsQueryResponse,
  key: string
): string | null {
  const metric = response.meta.availableMetrics.find(
    (metadata) => metadata.key === key
  );

  if (!metric) {
    throw new Error(`Expected metric metadata for ${key}`);
  }

  return metric.description;
}

function analyticsDefinition() {
  return {
    events: [
      {
        type: "goal",
        valueSchema: {
          type: "number"
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
              type: "number"
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
          type: "string"
        }
      }
    ],
    virtualMetrics: [
      {
        metric: "total",
        value: {
          op: "add",
          args: [
            {
              path: "metrics.points"
            },
            {
              path: "metrics.assists"
            },
            {
              path: "metrics.goals"
            }
          ]
        }
      }
    ],
    featuredMetrics: {
      points: "total"
    },
    metrics: [
      {
        key: "goals",
        label: "metric.goals",
        valueType: "number",
        format: "integer"
      },
      {
        key: "points",
        label: "metric.points",
        description: "metric.points.description",
        valueType: "number",
        format: "integer"
      },
      {
        key: "assists",
        label: "metric.assists",
        valueType: "number",
        format: "integer"
      },
      {
        key: "total",
        label: "metric.total",
        valueType: "number",
        format: "integer"
      }
    ]
  };
}

function uniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function uniqueAccountName(prefix: string): string {
  const normalized = prefix.replaceAll(/[^A-Za-z0-9]/g, "").slice(0, 10);

  return `${normalized}${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

function uniquePlayerName(prefix: string): string {
  return prefix.replaceAll(/[^A-Za-z0-9]/g, "").slice(0, 25) || "player";
}

function uniqueDiscordId(): string {
  return `8${crypto
    .randomUUID()
    .replaceAll(/[^0-9]/g, "")
    .padEnd(17, "0")
    .slice(0, 17)}`;
}
