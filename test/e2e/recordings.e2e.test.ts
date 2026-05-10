import { describe, expect, it } from "bun:test";
import { db } from "@/db/client";
import {
  recordingBytes,
  recordingFile
} from "@/test/e2e/fixtures/recording";
import type { RecordingResponse } from "@/features/recordings/recording.contract";
import { recordings } from "@/features/recordings/recording.db";
import {
  recordingObjectExists,
  request
} from "@/test/e2e/helpers/helpers";
import { createUniquePublicId } from "@/features/recordings/create-recording";

describe("recordings", () => {
  it("saves a recording", async () => {
    const formData = new FormData();
    formData.set("file", recordingFile());

    const response = await request("/api/recs", {
      method: "POST",
      body: formData
    });

    expect(response.status).toBe(201);

    const recording: RecordingResponse = await response.json();
    const publicBaseUrl = Bun.env.R2_PUBLIC_BASE_URL ?? "";

    expect(recording.id).toMatch(/^[a-f0-9]{7,64}$/);
    expect(recording.url.startsWith(`${publicBaseUrl}/`)).toBe(true);
    expect(recording.url.endsWith(`${recording.id}.hbr2`)).toBe(true);
    expect(recording).toMatchObject({
      sizeBytes: recordingBytes().byteLength,
      createdAt: expect.any(String)
    });
    expect(await recordingObjectExists(`${recording.id}.hbr2`)).toBe(true);
  });

  it("returns an existing recording for duplicate uploads", async () => {
    const firstFormData = new FormData();
    firstFormData.set("file", recordingFile());

    const firstResponse = await request("/api/recs", {
      method: "POST",
      body: firstFormData
    });

    expect([200, 201]).toContain(firstResponse.status);

    const firstRecording: RecordingResponse = await firstResponse.json();
    const secondFormData = new FormData();
    secondFormData.set("file", recordingFile());

    const secondResponse = await request("/api/recs", {
      method: "POST",
      body: secondFormData
    });

    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toEqual(firstRecording);
    expect(await recordingObjectExists(`${firstRecording.id}.hbr2`)).toBe(true);
  });

  it("extends the public ID when a hash prefix collides", async () => {
    await db.insert(recordings).values({
      publicId: "abcdef0",
      sha256: "abcdef0".padEnd(64, "0"),
      objectKey: "abcdef0.hbr2",
      sizeBytes: 1
    });

    const publicId = await createUniquePublicId(
      "abcdef1".padEnd(64, "1")
    );

    expect(publicId).toBe("abcdef1");
  });

  it("gets a recording by public ID", async () => {
    const formData = new FormData();
    formData.set("file", recordingFile());

    const createResponse = await request("/api/recs", {
      method: "POST",
      body: formData
    });

    expect([200, 201]).toContain(createResponse.status);

    const recording: RecordingResponse = await createResponse.json();
    const getResponse = await request(`/api/recs/${recording.id}`);

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(recording);
  });

  it("lists recordings", async () => {
    const formData = new FormData();
    formData.set("file", recordingFile());

    const createResponse = await request("/api/recs", {
      method: "POST",
      body: formData
    });

    expect([200, 201]).toContain(createResponse.status);

    const recording: RecordingResponse = await createResponse.json();
    const listResponse = await request("/api/recs");

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toContainEqual(recording);
  });

  it("rejects invalid recordings", async () => {
    const formData = new FormData();
    formData.set("file", new File(["invalid-rec"], "invalid.hbr2"));

    const response = await request("/api/recs", {
      method: "POST",
      body: formData
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid recording file"
      }
    });
  });

  it("returns 404 when a recording does not exist", async () => {
    const response = await request("/api/recs/fffffff");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Recording not found"
      }
    });
  });
});
