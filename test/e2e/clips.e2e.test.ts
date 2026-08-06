import { describe, expect, it } from "bun:test";
import { recordingFile } from "@/test/e2e/fixtures/recording";
import { paginatedItems, request } from "@/test/e2e/helpers/helpers";

type ClipResponse = {
  id: string;
  title: string | null;
  startTick: number;
  endTick: number;
  durationTicks: number;
  sourceKind: string;
  recording: {
    id: string;
    format: string | null;
    extensionVersion: number | null;
    totalFrames: number | null;
  };
  createdAt: string;
  updatedAt: string;
};

describe("clips", () => {
  it("returns the clip editing configuration", async () => {
    const response = await request("/api/clips/config");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      maxDurationSeconds: 30,
      maxDurationFrames: 1_800
    });
  });

  it("accepts a bounded export profile and exposes its queued lifecycle", async () => {
    const recording = await (await uploadRecording()).json();
    const clip = await (
      await request("/api/clips", {
        method: "POST",
        body: { recordingId: recording.id, startTick: 0, endTick: 120 }
      })
    ).json();

    const capabilities = await request(
      `/api/clips/${clip.id}/exports/capabilities`
    );
    expect(capabilities.status).toBe(200);
    expect(await capabilities.json()).toMatchObject({
      ttlSeconds: 86_400,
      formats: ["mp4", "webm", "gif"],
      orientations: ["landscape", "vertical"]
    });

    const created = await request(`/api/clips/${clip.id}/exports`, {
      method: "POST",
      body: {
        format: "webm",
        orientation: "vertical",
        scoreboard: "floating-compact"
      }
    });
    expect(created.status).toBe(202);
    expect(await created.json()).toMatchObject({
      profile: {
        format: "webm",
        orientation: "vertical",
        scoreboard: "floating-compact"
      },
      status: "queued",
      url: null
    });

    const exports = await request(`/api/clips/${clip.id}/exports`);
    expect(exports.status).toBe(200);
    expect((await exports.json()).items).toHaveLength(1);
  });

  it("creates, reads, lists, updates, and archives a clip", async () => {
    const recordingResponse = await uploadRecording();
    const recording = await recordingResponse.json();

    const createResponse = await request("/api/clips", {
      method: "POST",
      body: {
        recordingId: recording.id,
        startTick: 120,
        endTick: 360,
        title: "  Gol decisivo  "
      }
    });

    expect(createResponse.status).toBe(201);
    const created: ClipResponse = await createResponse.json();
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created).toMatchObject({
      title: "Gol decisivo",
      startTick: 120,
      endTick: 360,
      durationTicks: 240,
      sourceKind: "web",
      recording: {
        id: recording.id,
        format: "hbr2",
        extensionVersion: null,
        totalFrames: 824
      }
    });

    const getResponse = await request(`/api/clips/${created.id}`);
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(created);

    const listResponse = await request(
      `/api/clips?recordingId=${encodeURIComponent(recording.id)}`
    );
    expect(listResponse.status).toBe(200);
    expect(await paginatedItems<ClipResponse>(listResponse)).toContainEqual(
      created
    );

    const updateResponse = await request(`/api/clips/${created.id}`, {
      method: "PATCH",
      body: {
        title: "Lance em destaque",
        startTick: 200,
        endTick: 420
      }
    });
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({
      id: created.id,
      title: "Lance em destaque",
      startTick: 200,
      endTick: 420,
      durationTicks: 220
    });

    const archiveResponse = await request(`/api/clips/${created.id}`, {
      method: "DELETE"
    });
    expect(archiveResponse.status).toBe(204);

    const archivedGetResponse = await request(`/api/clips/${created.id}`);
    expect(archivedGetResponse.status).toBe(404);
  });

  it("rejects ranges outside the decoded recording timeline", async () => {
    const recordingResponse = await uploadRecording();
    const recording = await recordingResponse.json();

    const response = await request("/api/clips", {
      method: "POST",
      body: {
        recordingId: recording.id,
        startTick: 700,
        endTick: 825
      }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "O fim do clipe ultrapassa a duração da gravação"
      }
    });
  });

  it("returns not found for an unknown recording", async () => {
    const response = await request("/api/clips", {
      method: "POST",
      body: {
        recordingId: "ffffffff",
        startTick: 0,
        endTick: 20
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
});

async function uploadRecording(): Promise<Response> {
  const formData = new FormData();
  formData.set("file", recordingFile());

  const response = await request("/api/recs", {
    method: "POST",
    body: formData
  });

  expect([200, 201]).toContain(response.status);
  return response;
}
