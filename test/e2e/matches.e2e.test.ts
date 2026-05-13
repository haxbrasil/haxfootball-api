import { describe, expect, it } from "bun:test";
import { recordingFile } from "@/test/e2e/fixtures/recording";
import { paginatedItems, request } from "@/test/e2e/helpers/helpers";

type MatchEventResponse = {
  sequence: number;
  team?: string;
};

type MatchResponse = {
  id: string;
  status: string;
  initiatedAt: string | null;
  endedAt: string | null;
  score: MatchScoreResponse | null;
  recording: RecordingResponse | null;
  events: MatchEventResponse[];
  participations: unknown[];
  createdAt: string;
  updatedAt: string;
};

type MatchSummaryResponse = Omit<MatchResponse, "events" | "participations">;

type MatchScoreResponse = {
  red: number;
  blue: number;
};

type PlayerResponse = {
  id: string;
};

type RecordingResponse = {
  id: string;
  url: string;
  sizeBytes: number;
  createdAt: string;
};

describe("matches", () => {
  it("creates an ongoing match", async () => {
    const response = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        initiatedAt: "2026-05-10T12:00:00.000Z"
      }
    });

    expect(response.status).toBe(201);

    const match: MatchResponse = await response.json();

    expect(match).toMatchObject({
      id: expect.stringMatching(/^[a-z2-9]{8}$/),
      status: "ongoing",
      initiatedAt: "2026-05-10T12:00:00.000Z",
      endedAt: null,
      score: null,
      recording: null,
      events: [],
      participations: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
  });

  it("creates a completed match with score metadata", async () => {
    const response = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        initiatedAt: "2026-05-10T12:00:00.000Z",
        endedAt: "2026-05-10T12:15:00.000Z",
        score: {
          red: 21,
          blue: 14
        }
      }
    });

    expect(response.status).toBe(201);

    const match: MatchResponse = await response.json();

    expect(match).toMatchObject({
      status: "completed",
      endedAt: "2026-05-10T12:15:00.000Z",
      score: {
        red: 21,
        blue: 14
      }
    });
  });

  it("rejects completed matches without endedAt or score", async () => {
    const withoutEndedAtResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        score: {
          red: 7,
          blue: 0
        }
      }
    });

    expect(withoutEndedAtResponse.status).toBe(400);
    expect(await withoutEndedAtResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Completed matches must include an endedAt timestamp"
      }
    });

    const withoutScoreResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-05-10T12:15:00.000Z"
      }
    });

    expect(withoutScoreResponse.status).toBe(400);
    expect(await withoutScoreResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Completed matches must include a score"
      }
    });
  });

  it("updates an ongoing match and rejects edits after completion", async () => {
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing"
      }
    });

    expect(createResponse.status).toBe(201);

    const createdMatch: MatchResponse = await createResponse.json();
    const completeResponse = await request(`/api/matches/${createdMatch.id}`, {
      method: "PATCH",
      body: {
        status: "completed",
        endedAt: "2026-05-10T12:30:00.000Z",
        score: {
          red: 10,
          blue: 3
        }
      }
    });

    expect(completeResponse.status).toBe(200);
    expect(await completeResponse.json()).toMatchObject({
      status: "completed",
      endedAt: "2026-05-10T12:30:00.000Z",
      score: {
        red: 10,
        blue: 3
      }
    });

    const editResponse = await request(`/api/matches/${createdMatch.id}`, {
      method: "PATCH",
      body: {
        initiatedAt: "2026-05-10T12:01:00.000Z"
      }
    });

    expect(editResponse.status).toBe(400);
    expect(await editResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Completed matches cannot be edited"
      }
    });
  });

  it("requires completion fields when updating an ongoing match to completed", async () => {
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing"
      }
    });

    expect(createResponse.status).toBe(201);

    const match: MatchResponse = await createResponse.json();
    const withoutEndedAtResponse = await request(`/api/matches/${match.id}`, {
      method: "PATCH",
      body: {
        status: "completed",
        score: {
          red: 1,
          blue: 0
        }
      }
    });

    expect(withoutEndedAtResponse.status).toBe(400);
    expect(await withoutEndedAtResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Completed matches must include an endedAt timestamp"
      }
    });

    const withoutScoreResponse = await request(`/api/matches/${match.id}`, {
      method: "PATCH",
      body: {
        status: "completed",
        endedAt: "2026-05-10T12:30:00.000Z"
      }
    });

    expect(withoutScoreResponse.status).toBe(400);
    expect(await withoutScoreResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Completed matches must include a score"
      }
    });
  });

  it("stores player events and exposes consolidated participation stints", async () => {
    const firstPlayer = await createPlayer("switcher");
    const secondPlayer = await createPlayer("receiver");
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        events: [
          {
            type: "player_join",
            playerId: firstPlayer.id,
            team: "red",
            roomPlayerId: 1,
            occurredAt: "2026-05-10T12:00:00.000Z",
            elapsedSeconds: 0
          },
          {
            type: "player_team_change",
            playerId: firstPlayer.id,
            team: "blue",
            roomPlayerId: 1,
            occurredAt: "2026-05-10T12:05:00.000Z",
            elapsedSeconds: 300
          },
          {
            type: "player_leave",
            playerId: firstPlayer.id,
            roomPlayerId: 1,
            occurredAt: "2026-05-10T12:06:00.000Z",
            elapsedSeconds: 360
          },
          {
            type: "player_join",
            playerId: secondPlayer.id,
            team: "spectators",
            roomPlayerId: 2,
            occurredAt: "2026-05-10T12:07:00.000Z",
            elapsedSeconds: 420
          },
          {
            type: "player_team_change",
            playerId: secondPlayer.id,
            team: "red",
            roomPlayerId: 2,
            occurredAt: "2026-05-10T12:08:00.000Z",
            elapsedSeconds: 480
          }
        ]
      }
    });

    expect(createResponse.status).toBe(201);

    const match: MatchResponse = await createResponse.json();

    expect(match.events).toHaveLength(5);
    expect(match.events.map((event) => event.sequence)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(match.participations).toMatchObject([
      {
        player: {
          id: firstPlayer.id
        },
        team: "red",
        roomPlayerId: 1,
        joinedElapsedSeconds: 0,
        leftElapsedSeconds: 300
      },
      {
        player: {
          id: firstPlayer.id
        },
        team: "blue",
        roomPlayerId: 1,
        joinedElapsedSeconds: 300,
        leftElapsedSeconds: 360
      },
      {
        player: {
          id: secondPlayer.id
        },
        team: "red",
        roomPlayerId: 2,
        joinedElapsedSeconds: 480,
        leftElapsedSeconds: null
      }
    ]);
  });

  it("closes a field stint when a player moves to spectators", async () => {
    const player = await createPlayer("spectator-switch");
    const response = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        events: [
          {
            type: "player_join",
            playerId: player.id,
            team: "red",
            roomPlayerId: 9,
            occurredAt: "2026-05-10T12:00:00.000Z",
            elapsedSeconds: 0
          },
          {
            type: "player_team_change",
            playerId: player.id,
            team: "spectators",
            roomPlayerId: 9,
            occurredAt: "2026-05-10T12:03:00.000Z",
            elapsedSeconds: 180
          }
        ]
      }
    });

    expect(response.status).toBe(201);

    const match: MatchResponse = await response.json();

    expect(match.events.map((event) => event.team)).toEqual([
      "red",
      "spectators"
    ]);
    expect(match.participations).toEqual([
      expect.objectContaining({
        player: expect.objectContaining({
          id: player.id
        }),
        team: "red",
        roomPlayerId: 9,
        joinedAt: "2026-05-10T12:00:00.000Z",
        leftAt: "2026-05-10T12:03:00.000Z",
        joinedElapsedSeconds: 0,
        leftElapsedSeconds: 180
      })
    ]);
  });

  it("keeps distinct room-player stints separate for the same player", async () => {
    const player = await createPlayer("multi-room-id");
    const response = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        events: [
          {
            type: "player_join",
            playerId: player.id,
            team: "red",
            roomPlayerId: 1
          },
          {
            type: "player_join",
            playerId: player.id,
            team: "blue",
            roomPlayerId: 2
          },
          {
            type: "player_leave",
            playerId: player.id,
            roomPlayerId: 1
          }
        ]
      }
    });

    expect(response.status).toBe(201);

    const match: MatchResponse = await response.json();

    expect(match.participations).toMatchObject([
      {
        player: {
          id: player.id
        },
        team: "red",
        roomPlayerId: 1,
        leftAt: null,
        leftElapsedSeconds: null
      },
      {
        player: {
          id: player.id
        },
        team: "blue",
        roomPlayerId: 2,
        leftAt: null,
        leftElapsedSeconds: null
      }
    ]);
  });

  it("closes all active stints for a player when leave has no room player ID", async () => {
    const player = await createPlayer("leave-all");
    const response = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        events: [
          {
            type: "player_join",
            playerId: player.id,
            team: "red",
            roomPlayerId: 3,
            occurredAt: "2026-05-10T12:00:00.000Z",
            elapsedSeconds: 0
          },
          {
            type: "player_join",
            playerId: player.id,
            team: "blue",
            roomPlayerId: 4,
            occurredAt: "2026-05-10T12:01:00.000Z",
            elapsedSeconds: 60
          },
          {
            type: "player_leave",
            playerId: player.id,
            occurredAt: "2026-05-10T12:02:00.000Z",
            elapsedSeconds: 120
          }
        ]
      }
    });

    expect(response.status).toBe(201);

    const match: MatchResponse = await response.json();

    expect(match.participations).toMatchObject([
      {
        team: "red",
        roomPlayerId: 3,
        leftAt: "2026-05-10T12:02:00.000Z",
        leftElapsedSeconds: 120
      },
      {
        team: "blue",
        roomPlayerId: 4,
        leftAt: "2026-05-10T12:02:00.000Z",
        leftElapsedSeconds: 120
      }
    ]);
  });

  it("creates a new stint when a player rejoins after leaving", async () => {
    const player = await createPlayer("rejoin");
    const response = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        events: [
          {
            type: "player_join",
            playerId: player.id,
            team: "red",
            roomPlayerId: 5,
            occurredAt: "2026-05-10T12:00:00.000Z",
            elapsedSeconds: 0
          },
          {
            type: "player_leave",
            playerId: player.id,
            roomPlayerId: 5,
            occurredAt: "2026-05-10T12:01:00.000Z",
            elapsedSeconds: 60
          },
          {
            type: "player_join",
            playerId: player.id,
            team: "blue",
            roomPlayerId: 6,
            occurredAt: "2026-05-10T12:02:00.000Z",
            elapsedSeconds: 120
          }
        ]
      }
    });

    expect(response.status).toBe(201);

    const match: MatchResponse = await response.json();

    expect(match.participations).toMatchObject([
      {
        player: {
          id: player.id
        },
        team: "red",
        roomPlayerId: 5,
        joinedElapsedSeconds: 0,
        leftElapsedSeconds: 60
      },
      {
        player: {
          id: player.id
        },
        team: "blue",
        roomPlayerId: 6,
        joinedElapsedSeconds: 120,
        leftElapsedSeconds: null
      }
    ]);
  });

  it("appends events only while a match is ongoing", async () => {
    const player = await createPlayer("append");
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing"
      }
    });

    expect(createResponse.status).toBe(201);

    const match: MatchResponse = await createResponse.json();
    const appendResponse = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        events: [
          {
            type: "player_join",
            playerId: player.id,
            team: "red"
          }
        ]
      }
    });

    expect(appendResponse.status).toBe(200);
    expect(await appendResponse.json()).toMatchObject({
      events: [
        {
          sequence: 1,
          type: "player_join"
        }
      ],
      participations: [
        {
          player: {
            id: player.id
          },
          team: "red"
        }
      ]
    });

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

    const secondAppendResponse = await request(
      `/api/matches/${match.id}/events`,
      {
        method: "POST",
        body: {
          events: [
            {
              type: "player_leave",
              playerId: player.id
            }
          ]
        }
      }
    );

    expect(secondAppendResponse.status).toBe(400);
  });

  it("continues event sequences and recomputes stints when appending events", async () => {
    const player = await createPlayer("append-close");
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        events: [
          {
            type: "player_join",
            playerId: player.id,
            team: "red",
            occurredAt: "2026-05-10T12:00:00.000Z",
            elapsedSeconds: 0
          }
        ]
      }
    });

    expect(createResponse.status).toBe(201);

    const createdMatch: MatchResponse = await createResponse.json();
    const appendResponse = await request(
      `/api/matches/${createdMatch.id}/events`,
      {
        method: "POST",
        body: {
          events: [
            {
              type: "player_leave",
              playerId: player.id,
              occurredAt: "2026-05-10T12:01:00.000Z",
              elapsedSeconds: 60
            }
          ]
        }
      }
    );

    expect(appendResponse.status).toBe(200);

    const match: MatchResponse = await appendResponse.json();

    expect(match.events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(match.participations).toMatchObject([
      {
        player: {
          id: player.id
        },
        team: "red",
        joinedElapsedSeconds: 0,
        leftElapsedSeconds: 60
      }
    ]);
  });

  it("replaces events and recomputes stints when updating an ongoing match", async () => {
    const firstPlayer = await createPlayer("replace-first");
    const secondPlayer = await createPlayer("replace-second");
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        events: [
          {
            type: "player_join",
            playerId: firstPlayer.id,
            team: "red"
          }
        ]
      }
    });

    expect(createResponse.status).toBe(201);

    const createdMatch: MatchResponse = await createResponse.json();
    const updateResponse = await request(`/api/matches/${createdMatch.id}`, {
      method: "PATCH",
      body: {
        events: [
          {
            type: "player_join",
            playerId: secondPlayer.id,
            team: "blue"
          }
        ]
      }
    });

    expect(updateResponse.status).toBe(200);

    const match: MatchResponse = await updateResponse.json();

    expect(match.events).toMatchObject([
      {
        sequence: 1,
        player: {
          id: secondPlayer.id
        },
        team: "blue"
      }
    ]);
    expect(match.participations).toMatchObject([
      {
        player: {
          id: secondPlayer.id
        },
        team: "blue"
      }
    ]);
    expect(match.events).not.toContainEqual(
      expect.objectContaining({
        player: expect.objectContaining({
          id: firstPlayer.id
        })
      })
    );
  });

  it("rejects invalid player events", async () => {
    const player = await createPlayer("invalid-event");
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing"
      }
    });

    expect(createResponse.status).toBe(201);

    const match: MatchResponse = await createResponse.json();
    const leaveWithTeamResponse = await request(
      `/api/matches/${match.id}/events`,
      {
        method: "POST",
        body: {
          events: [
            {
              type: "player_leave",
              playerId: player.id,
              team: "red"
            }
          ]
        }
      }
    );

    expect(leaveWithTeamResponse.status).toBe(400);
    expect(await leaveWithTeamResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Player leave events cannot include a team"
      }
    });

    const joinWithoutTeamResponse = await request(
      `/api/matches/${match.id}/events`,
      {
        method: "POST",
        body: {
          events: [
            {
              type: "player_join",
              playerId: player.id
            }
          ]
        }
      }
    );

    expect(joinWithoutTeamResponse.status).toBe(400);
    expect(await joinWithoutTeamResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Player join and team change events must include a team"
      }
    });

    const partialTimeResponse = await request(
      `/api/matches/${match.id}/events`,
      {
        method: "POST",
        body: {
          events: [
            {
              type: "player_join",
              playerId: player.id,
              team: "red",
              occurredAt: "2026-05-10T12:00:00.000Z"
            }
          ]
        }
      }
    );

    expect(partialTimeResponse.status).toBe(400);
    expect(await partialTimeResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message:
          "Player event occurredAt and elapsedSeconds must be provided together"
      }
    });
  });

  it("rejects event references to unknown players", async () => {
    const response = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        events: [
          {
            type: "player_join",
            playerId: "missing-player",
            team: "red"
          }
        ]
      }
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Player not found"
      }
    });
  });

  it("rejects empty appended event batches through validation", async () => {
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing"
      }
    });

    expect(createResponse.status).toBe(201);

    const match: MatchResponse = await createResponse.json();
    const response = await request(`/api/matches/${match.id}/events`, {
      method: "POST",
      body: {
        events: []
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
  });

  it("associates a recording with a match once", async () => {
    const recording = await createRecording();
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "completed",
        endedAt: "2026-05-10T12:15:00.000Z",
        score: {
          red: 2,
          blue: 1
        }
      }
    });

    expect(createResponse.status).toBe(201);

    const match: MatchResponse = await createResponse.json();
    const associateResponse = await request(
      `/api/matches/${match.id}/recording`,
      {
        method: "PATCH",
        body: {
          recordingId: recording.id
        }
      }
    );

    expect(associateResponse.status).toBe(200);
    expect(await associateResponse.json()).toMatchObject({
      recording
    });

    const replaceResponse = await request(
      `/api/matches/${match.id}/recording`,
      {
        method: "PATCH",
        body: {
          recordingId: recording.id
        }
      }
    );

    expect(replaceResponse.status).toBe(400);
    expect(await replaceResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Match already has a recording"
      }
    });

    const secondMatchResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing",
        recordingId: recording.id
      }
    });

    expect(secondMatchResponse.status).toBe(400);
    expect(await secondMatchResponse.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Recording is already associated with a match"
      }
    });
  });

  it("returns 404 for unknown recording associations", async () => {
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing"
      }
    });

    expect(createResponse.status).toBe(201);

    const match: MatchResponse = await createResponse.json();
    const response = await request(`/api/matches/${match.id}/recording`, {
      method: "PATCH",
      body: {
        recordingId: "ffffffff"
      }
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Recording not found"
      }
    });
  });

  it("lists and gets matches", async () => {
    const createResponse = await request("/api/matches", {
      method: "POST",
      body: {
        status: "ongoing"
      }
    });

    expect(createResponse.status).toBe(201);

    const match: MatchResponse = await createResponse.json();
    const listResponse = await request("/api/matches");

    expect(listResponse.status).toBe(200);

    const matches = await paginatedItems<MatchSummaryResponse>(listResponse);
    const listedMatch = matches.find((item) => item.id === match.id);

    expect(listedMatch).toMatchObject({
      id: match.id,
      status: match.status,
      initiatedAt: match.initiatedAt,
      endedAt: match.endedAt,
      score: match.score,
      recording: match.recording,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt
    });
    expect(listedMatch).not.toHaveProperty("events");
    expect(listedMatch).not.toHaveProperty("participations");

    const getResponse = await request(`/api/matches/${match.id}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(match);
  });

  it("returns 404 for missing matches", async () => {
    const getResponse = await request("/api/matches/aaaaaaaa");
    const updateResponse = await request("/api/matches/aaaaaaaa", {
      method: "PATCH",
      body: {
        initiatedAt: "2026-05-10T12:00:00.000Z"
      }
    });
    const appendResponse = await request("/api/matches/aaaaaaaa/events", {
      method: "POST",
      body: {
        events: [
          {
            type: "player_join",
            playerId: "missing-player",
            team: "red"
          }
        ]
      }
    });
    const recordingResponse = await request("/api/matches/aaaaaaaa/recording", {
      method: "PATCH",
      body: {
        recordingId: "ffffffff"
      }
    });

    expect(getResponse.status).toBe(404);
    expect(updateResponse.status).toBe(404);
    expect(appendResponse.status).toBe(404);
    expect(recordingResponse.status).toBe(404);
  });
});

async function createPlayer(label: string): Promise<PlayerResponse> {
  const suffix = crypto.randomUUID();
  const response = await request("/api/players", {
    method: "POST",
    body: {
      externalId: `${label}-${suffix}`,
      name: label.slice(0, 25)
    }
  });

  expect(response.status).toBe(201);

  return response.json();
}

async function createRecording(): Promise<RecordingResponse> {
  const formData = new FormData();
  formData.set("file", recordingFile());

  const response = await request("/api/recs", {
    method: "POST",
    body: formData
  });

  expect([200, 201]).toContain(response.status);

  return response.json();
}
