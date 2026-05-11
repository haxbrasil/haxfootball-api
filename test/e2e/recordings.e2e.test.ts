import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recordingBytes, recordingFile } from "@/test/e2e/fixtures/recording";
import type { RecordingResponse } from "@/features/recordings/recording.contract";
import { recordings } from "@/features/recordings/recording.db";
import { recordingObjectExists, request } from "@/test/e2e/helpers/helpers";
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

    const rows = await db
      .select()
      .from(recordings)
      .where(eq(recordings.publicId, firstRecording.id));

    expect(rows).toHaveLength(1);
  });

  it("extends the public ID when a hash prefix collides", async () => {
    await db.insert(recordings).values({
      publicId: "abcdef0",
      sha256: "abcdef0".padEnd(64, "0"),
      objectKey: "abcdef0.hbr2",
      sizeBytes: 1
    });

    const publicId = await createUniquePublicId("abcdef1".padEnd(64, "1"));

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

  it("lists recordings newest first", async () => {
    await db.insert(recordings).values([
      {
        publicId: "aaaaaaa",
        sha256: "a".repeat(64),
        objectKey: "aaaaaaa.hbr2",
        sizeBytes: 1,
        createdAt: "2026-05-10T12:00:00.000Z"
      },
      {
        publicId: "bbbbbbb",
        sha256: "b".repeat(64),
        objectKey: "bbbbbbb.hbr2",
        sizeBytes: 2,
        createdAt: "2026-05-10T12:01:00.000Z"
      }
    ]);

    const response = await request("/api/recs");

    expect(response.status).toBe(200);

    const body: RecordingResponse[] = await response.json();
    const firstIndex = body.findIndex(
      (recording) => recording.id === "aaaaaaa"
    );
    const secondIndex = body.findIndex(
      (recording) => recording.id === "bbbbbbb"
    );

    expect(secondIndex).toBeLessThan(firstIndex);
  });

  it("does not expose internal recording fields", async () => {
    const formData = new FormData();
    formData.set("file", recordingFile());

    const response = await request("/api/recs", {
      method: "POST",
      body: formData
    });

    expect([200, 201]).toContain(response.status);

    const recording = await response.json();

    expect(recording.sha256).toBeUndefined();
    expect(recording.objectKey).toBeUndefined();
    expect(recording.publicId).toBeUndefined();
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

  it("rejects missing recording files", async () => {
    const response = await request("/api/recs", {
      method: "POST",
      body: new FormData()
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
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

  it("rejects invalid recording public IDs", async () => {
    const tooShortResponse = await request("/api/recs/abc");
    const nonHexResponse = await request("/api/recs/zzzzzzz");

    expect(tooShortResponse.status).toBe(400);
    expect(nonHexResponse.status).toBe(400);
    expect(await tooShortResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
    expect(await nonHexResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });
  });
});
