import { describe, expect, it } from "bun:test";
import {
  paginatedBody,
  paginatedItems,
  request
} from "@/test/e2e/helpers/helpers";

type GameModeResponse = {
  id: string;
  name: string;
  title: LocalizedTextResponse | null;
  description: LocalizedTextResponse | null;
  visibility: "visible" | "hidden";
  rank: number;
  createdAt: string;
  updatedAt: string;
};

type LocalizedTextResponse = {
  value: string;
  label: string;
};

type MatchResponse = {
  id: string;
  gameMode: GameModeResponse | null;
};

type PlayerResponse = {
  id: string;
};

type StatEventSchemaResponse = {
  id: string;
  name: string;
  version: number;
};

type MetricsQueryResponse = {
  items: Array<{
    metrics: Record<string, unknown>;
    contribution: {
      matchesCount: number;
      eventsCount: number;
    };
  }>;
  meta: {
    totals: {
      matchesCount: number;
      eventsCount: number;
    };
  };
};

describe("game modes", () => {
  it("creates, lists, gets, and updates game modes by visibility and rank", async () => {
    const visibleLowTitle = uniqueValueKey("game-mode.visible-low.title");
    const visibleLowDescription = uniqueValueKey(
      "game-mode.visible-low.description"
    );
    const visibleHighTitle = uniqueValueKey("game-mode.visible-high.title");
    const updatedTitle = uniqueValueKey("game-mode.updated.title");

    const valuesResponse = await request("/api/values/bulk", {
      method: "POST",
      body: {
        values: [
          {
            value: visibleLowTitle,
            language: "en",
            label: "Visible Low"
          },
          {
            value: visibleLowTitle,
            language: "pt-br",
            label: "Visivel Baixo"
          },
          {
            value: visibleLowDescription,
            language: "en",
            label: "Visible low rank"
          },
          {
            value: visibleLowDescription,
            language: "pt-br",
            label: "Rank baixo visivel"
          },
          {
            value: visibleHighTitle,
            language: "en",
            label: "Visible High"
          },
          {
            value: updatedTitle,
            language: "en",
            label: "Updated mode"
          }
        ]
      }
    });

    expect(valuesResponse.status).toBe(200);

    const visibleLowResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: uniqueName("mode-visible-low"),
        title: visibleLowTitle,
        description: visibleLowDescription,
        visibility: "visible",
        rank: 20
      }
    });
    const visibleHighResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: uniqueName("mode-visible-high"),
        title: visibleHighTitle,
        visibility: "visible",
        rank: 10
      }
    });
    const hiddenResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: uniqueName("mode-hidden"),
        visibility: "hidden",
        rank: 1
      }
    });

    const visibleLow = await expectCreatedGameMode(visibleLowResponse);
    const visibleHigh = await expectCreatedGameMode(visibleHighResponse);
    const hidden = await expectCreatedGameMode(hiddenResponse);

    expect(typeof visibleLow.id).toBe("string");
    expect(visibleLow.title).toEqual({
      value: visibleLowTitle,
      label: "Visible Low"
    });
    expect(visibleLow.description).toEqual({
      value: visibleLowDescription,
      label: "Visible low rank"
    });
    expect(visibleLow.visibility).toBe("visible");
    expect(visibleLow.rank).toBe(20);
    expect(typeof visibleLow.createdAt).toBe("string");
    expect(typeof visibleLow.updatedAt).toBe("string");

    const visibleListResponse = await request("/api/game-modes?limit=100");

    expect(visibleListResponse.status).toBe(200);

    const visibleItems =
      await paginatedItems<GameModeResponse>(visibleListResponse);
    const visibleNames = visibleItems.map((item) => item.name);

    expect(visibleNames.indexOf(visibleHigh.name)).toBeLessThan(
      visibleNames.indexOf(visibleLow.name)
    );
    expect(visibleNames).not.toContain(hidden.name);

    const allListResponse = await request("/api/game-modes?visibility=all");

    expect(allListResponse.status).toBe(200);

    const allNames = (
      await paginatedItems<GameModeResponse>(allListResponse)
    ).map((item) => item.name);

    expect(allNames).toContain(hidden.name);

    const getResponse = await request(`/api/game-modes/${visibleLow.id}`);
    const getByNameResponse = await request(
      `/api/game-modes/by-name/${visibleLow.name}`
    );
    const translatedGetResponse = await request(
      `/api/game-modes/${visibleLow.id}?language=pt-br`
    );

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(visibleLow);
    expect(getByNameResponse.status).toBe(200);
    expect(await getByNameResponse.json()).toEqual(visibleLow);
    expect(translatedGetResponse.status).toBe(200);
    expect(await translatedGetResponse.json()).toMatchObject({
      id: visibleLow.id,
      title: {
        value: visibleLowTitle,
        label: "Visivel Baixo"
      },
      description: {
        value: visibleLowDescription,
        label: "Rank baixo visivel"
      }
    });

    const updateResponse = await request(`/api/game-modes/${visibleLow.id}`, {
      method: "PATCH",
      body: {
        title: updatedTitle,
        description: null,
        visibility: "hidden",
        rank: 5
      }
    });

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({
      id: visibleLow.id,
      name: visibleLow.name,
      title: {
        value: updatedTitle,
        label: "Updated mode"
      },
      description: null,
      visibility: "hidden",
      rank: 5
    });
  });

  it("binds matches to game modes and filters matches by game mode", async () => {
    const firstModeResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: uniqueName("match-mode-a"),
        rank: 1
      }
    });
    const secondModeResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: uniqueName("match-mode-b"),
        rank: 2
      }
    });

    const firstMode = await expectCreatedGameMode(firstModeResponse);
    const secondMode = await expectCreatedGameMode(secondModeResponse);

    const firstMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        gameMode: {
          name: firstMode.name
        }
      }
    });
    const secondMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        gameMode: {
          id: secondMode.id
        }
      }
    });

    expect(firstMatchResponse.status).toBe(201);
    expect(secondMatchResponse.status).toBe(201);

    const firstMatch: MatchResponse = await firstMatchResponse.json();

    expect(firstMatch.gameMode).toMatchObject({
      id: firstMode.id,
      name: firstMode.name
    });

    const listResponse = await request(
      `/api/matches?gameMode=${firstMode.name}&limit=100`
    );

    expect(listResponse.status).toBe(200);

    const matches = await paginatedItems<MatchResponse>(listResponse);

    expect(matches.map((match) => match.id)).toContain(firstMatch.id);
    expect(
      matches.every((match) => match.gameMode?.name === firstMode.name)
    ).toBe(true);
  });

  it("filters aggregate metrics by game mode", async () => {
    const schemaResponse = await request("/api/stat-event-schemas", {
      method: "POST",
      body: {
        name: uniqueName("game-mode-schema"),
        definition: {
          events: [
            {
              type: "score",
              valueSchema: {
                type: "number"
              },
              aggregations: [
                {
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
          metrics: [
            {
              key: "points",
              label: "metric.points"
            }
          ]
        }
      }
    });
    const playerResponse = await request("/api/players", {
      method: "POST",
      body: {
        externalId: uniqueName("game-mode-player"),
        name: `Player ${crypto.randomUUID().slice(0, 8)}`
      }
    });
    const firstModeResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: uniqueName("metrics-mode-a"),
        rank: 1
      }
    });
    const secondModeResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: uniqueName("metrics-mode-b"),
        rank: 2
      }
    });

    expect(schemaResponse.status).toBe(201);
    expect(playerResponse.status).toBe(201);

    const schema: StatEventSchemaResponse = await schemaResponse.json();
    const player: PlayerResponse = await playerResponse.json();
    const firstMode = await expectCreatedGameMode(firstModeResponse);
    const secondMode = await expectCreatedGameMode(secondModeResponse);

    const firstMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        gameMode: {
          name: firstMode.name
        },
        statEventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });
    const secondMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        gameMode: {
          name: secondMode.name
        },
        statEventSchema: {
          id: schema.id,
          version: schema.version
        }
      }
    });

    expect(firstMatchResponse.status).toBe(201);
    expect(secondMatchResponse.status).toBe(201);

    const firstMatch: MatchResponse = await firstMatchResponse.json();
    const secondMatch: MatchResponse = await secondMatchResponse.json();

    const firstStatEventResponse = await request(
      `/api/matches/${firstMatch.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "score",
          playerId: player.id,
          value: 3
        }
      }
    );
    const secondStatEventResponse = await request(
      `/api/matches/${secondMatch.id}/stat-events`,
      {
        method: "POST",
        body: {
          type: "score",
          playerId: player.id,
          value: 9
        }
      }
    );

    expect(firstStatEventResponse.status).toBe(201);
    expect(secondStatEventResponse.status).toBe(201);

    const firstCompleteResponse = await request(
      `/api/matches/${firstMatch.id}`,
      {
        method: "PATCH",
        body: {
          status: "completed",
          endedAt: "2026-05-20T12:30:00.000Z",
          score: {
            red: 1,
            blue: 0
          }
        }
      }
    );
    const secondCompleteResponse = await request(
      `/api/matches/${secondMatch.id}`,
      {
        method: "PATCH",
        body: {
          status: "completed",
          endedAt: "2026-05-20T12:30:00.000Z",
          score: {
            red: 0,
            blue: 1
          }
        }
      }
    );

    expect(firstCompleteResponse.status).toBe(200);
    expect(secondCompleteResponse.status).toBe(200);

    const response = await request("/api/matches/metrics/query", {
      method: "POST",
      body: {
        schema: {
          id: schema.id
        },
        filters: {
          gameModeNames: [firstMode.name]
        },
        group: {
          by: "player"
        },
        metrics: ["points"]
      }
    });

    expect(response.status).toBe(200);

    const metrics: MetricsQueryResponse = await response.json();

    expect(metrics.items).toHaveLength(1);
    expect(metrics.items[0]).toMatchObject({
      metrics: {
        points: 3
      },
      contribution: {
        matchesCount: 1,
        eventsCount: 1
      }
    });
    expect(metrics.meta.totals).toMatchObject({
      matchesCount: 1,
      eventsCount: 1
    });
  });

  it("paginates game modes using rank order", async () => {
    const firstResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: uniqueName("page-mode-a"),
        rank: -10_000
      }
    });
    const secondResponse = await request("/api/game-modes", {
      method: "POST",
      body: {
        name: uniqueName("page-mode-b"),
        rank: -9_999
      }
    });

    const first = await expectCreatedGameMode(firstResponse);
    const second = await expectCreatedGameMode(secondResponse);

    const firstPageResponse = await request(
      "/api/game-modes?visibility=all&limit=1"
    );

    expect(firstPageResponse.status).toBe(200);

    const firstPage = await paginatedBody<GameModeResponse>(firstPageResponse);

    expect(firstPage.items[0]?.name).toBe(first.name);
    expect(firstPage.page.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await request(
      `/api/game-modes?visibility=all&limit=100&cursor=${encodeURIComponent(
        firstPage.page.nextCursor ?? ""
      )}`
    );

    expect(secondPageResponse.status).toBe(200);

    const secondPage =
      await paginatedBody<GameModeResponse>(secondPageResponse);
    const secondPageNames = secondPage.items.map((item) => item.name);

    expect(secondPageNames).toContain(second.name);
  });
});

async function expectCreatedGameMode(
  response: Response
): Promise<GameModeResponse> {
  expect(response.status).toBe(201);

  return response.json();
}

function uniqueName(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function uniqueValueKey(prefix: string) {
  return `${prefix}.${crypto.randomUUID()}`;
}
