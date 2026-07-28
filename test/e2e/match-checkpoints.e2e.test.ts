import { describe, expect, it } from "bun:test";
import { paginatedItems, request } from "@/test/e2e/helpers/helpers";
import { recordingFile } from "@/test/e2e/fixtures/recording";

describe("match checkpoints", () => {
  it("creates pending matches idempotently and persists event batches once", async () => {
    const sessionId = crypto.randomUUID();
    const createBody = {
      status: "pending",
      sessionId,
      initiatedAt: "2026-07-28T12:00:00.000Z",
      score: { red: 0, blue: 0 }
    };
    const firstResponse = await request("/api/matches", {
      method: "POST",
      body: createBody
    });
    const retryResponse = await request("/api/matches", {
      method: "POST",
      body: createBody
    });

    expect(firstResponse.status).toBe(201);
    expect(retryResponse.status).toBe(201);

    const first: { id: string } = await firstResponse.json();
    const retry: { id: string } = await retryResponse.json();

    expect(retry.id).toBe(first.id);

    const eventId = crypto.randomUUID();
    const checkpointBody = {
      revision: 1,
      observedAt: "2026-07-28T12:00:02.000Z",
      elapsedSeconds: 2,
      score: { red: 0, blue: 0 },
      status: "pending",
      events: [
        {
          id: eventId,
          producerSequence: 1,
          domain: "system",
          type: "checkpoint-test",
          scope: "match",
          value: {}
        }
      ]
    };
    const checkpointResponse = await request(
      `/api/matches/${first.id}/checkpoints`,
      {
        method: "POST",
        body: checkpointBody
      }
    );
    const checkpointRetryResponse = await request(
      `/api/matches/${first.id}/checkpoints`,
      {
        method: "POST",
        body: checkpointBody
      }
    );

    expect(checkpointResponse.status).toBe(200);
    expect(checkpointRetryResponse.status).toBe(200);

    const checkpoint: {
      acknowledgedProducerSequence: number;
      match: { events: Array<{ id: string }> };
    } = await checkpointRetryResponse.json();

    expect(checkpoint.acknowledgedProducerSequence).toBe(1);
    expect(checkpoint.match.events).toHaveLength(1);
    expect(checkpoint.match.events[0]?.id).toBe(eventId);
  });

  it("hides discarded matches and completes eligible checkpointed matches", async () => {
    const discarded = await createPendingMatch();
    const eligible = await createPendingMatch();

    const discardResponse = await checkpoint(discarded.id, {
      revision: 1,
      elapsedSeconds: 5,
      status: "discarded"
    });
    const promoteResponse = await checkpoint(eligible.id, {
      revision: 1,
      elapsedSeconds: 30,
      status: "ongoing"
    });
    const completeResponse = await checkpoint(eligible.id, {
      revision: 2,
      elapsedSeconds: 34,
      status: "completed",
      completionReason: "normal"
    });

    expect(discardResponse.status).toBe(200);
    expect(promoteResponse.status).toBe(200);
    expect(completeResponse.status).toBe(200);

    const completed: {
      match: { status: string; completionReason: string; endedAt: string };
    } = await completeResponse.json();

    expect(completed.match).toMatchObject({
      status: "completed",
      completionReason: "normal",
      endedAt: "2026-07-28T12:00:34.000Z"
    });

    const listResponse = await request("/api/matches?limit=100");
    const listed = await paginatedItems<{ id: string }>(listResponse);

    expect(listed.map((match) => match.id)).toContain(eligible.id);
    expect(listed.map((match) => match.id)).not.toContain(discarded.id);
  });

  it("promotes the latest recording checkpoint when the match completes", async () => {
    const match = await createPendingMatch();
    const checkpointFile = new File(
      [recordingFile(), crypto.randomUUID()],
      "checkpoint.hbr2",
      { type: "application/octet-stream" }
    );

    await checkpoint(match.id, {
      revision: 1,
      elapsedSeconds: 30,
      status: "ongoing"
    });

    const formData = new FormData();
    formData.set("revision", "1");
    formData.set("file", checkpointFile);

    const recordingCheckpointResponse = await request(
      `/api/matches/${match.id}/recording-checkpoint`,
      {
        method: "POST",
        body: formData
      }
    );

    expect(recordingCheckpointResponse.status).toBe(200);

    const completeResponse = await checkpoint(match.id, {
      revision: 2,
      elapsedSeconds: 35,
      status: "completed",
      completionReason: "normal"
    });
    const completed: {
      match: { recording: { sizeBytes: number } | null };
    } = await completeResponse.json();

    expect(completed.match.recording).toMatchObject({
      sizeBytes: checkpointFile.size
    });
  });
});

async function createPendingMatch(): Promise<{ id: string }> {
  const response = await request("/api/matches", {
    method: "POST",
    body: {
      status: "pending",
      sessionId: crypto.randomUUID(),
      initiatedAt: "2026-07-28T12:00:00.000Z",
      score: { red: 0, blue: 0 }
    }
  });

  expect(response.status).toBe(201);

  return response.json();
}

function checkpoint(
  id: string,
  input: {
    revision: number;
    elapsedSeconds: number;
    status: "ongoing" | "completed" | "discarded";
    completionReason?: "normal";
  }
): Promise<Response> {
  return request(`/api/matches/${id}/checkpoints`, {
    method: "POST",
    body: {
      ...input,
      observedAt: `2026-07-28T12:00:${String(input.elapsedSeconds).padStart(2, "0")}.000Z`,
      score: { red: 1, blue: 0 },
      events: []
    }
  });
}
