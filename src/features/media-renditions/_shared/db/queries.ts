import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  mediaRenditions,
  type MediaRendition,
  type MediaRenditionStatus
} from "@/features/media-renditions/db";

export async function getMediaRenditionsForClip(
  clipId: number
): Promise<MediaRendition[]> {
  return db
    .select()
    .from(mediaRenditions)
    .where(eq(mediaRenditions.clipId, clipId));
}

export async function getMediaRenditionsForClips(
  clipIds: number[]
): Promise<MediaRendition[]> {
  if (clipIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(mediaRenditions)
    .where(inArray(mediaRenditions.clipId, clipIds));
}

export async function getMediaRenditionByUuid(
  uuid: string
): Promise<MediaRendition | null> {
  const [rendition] = await db
    .select()
    .from(mediaRenditions)
    .where(eq(mediaRenditions.uuid, uuid));

  return rendition ?? null;
}

export async function getMediaRenditionByCacheKey(
  cacheKey: string
): Promise<MediaRendition | null> {
  const [rendition] = await db
    .select()
    .from(mediaRenditions)
    .where(eq(mediaRenditions.cacheKey, cacheKey));

  return rendition ?? null;
}

export async function insertMediaRendition(input: {
  clipId: number;
  purpose: MediaRendition["purpose"];
  cacheKey: string;
  sourceFingerprint: string;
  profileVersion: string;
}): Promise<MediaRendition> {
  const now = new Date().toISOString();
  const [rendition] = await db
    .insert(mediaRenditions)
    .values({
      uuid: crypto.randomUUID(),
      sourceKind: "clip",
      clipId: input.clipId,
      purpose: input.purpose,
      cacheKey: input.cacheKey,
      sourceFingerprint: input.sourceFingerprint,
      profileVersion: input.profileVersion,
      status: "queued",
      createdAt: now,
      updatedAt: now
    })
    .returning();

  return rendition;
}

export async function insertMediaRenditionIfMissing(input: {
  clipId: number;
  purpose: MediaRendition["purpose"];
  cacheKey: string;
  sourceFingerprint: string;
  profileVersion: string;
}): Promise<{ rendition: MediaRendition; created: boolean }> {
  const existing = await getMediaRenditionByCacheKey(input.cacheKey);
  if (existing) {
    return { rendition: existing, created: false };
  }

  try {
    return {
      rendition: await insertMediaRendition(input),
      created: true
    };
  } catch (error) {
    const concurrent = await getMediaRenditionByCacheKey(input.cacheKey);
    if (concurrent) {
      return { rendition: concurrent, created: false };
    }
    throw error;
  }
}

export async function claimMediaRendition(
  id: number
): Promise<MediaRendition | null> {
  const [rendition] = await db
    .update(mediaRenditions)
    .set({
      status: "running",
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date().toISOString()
    })
    .where(
      and(eq(mediaRenditions.id, id), eq(mediaRenditions.status, "queued"))
    )
    .returning();

  return rendition ?? null;
}

export async function updateMediaRenditionStatus(input: {
  id: number;
  status: MediaRenditionStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<MediaRendition> {
  const [rendition] = await db
    .update(mediaRenditions)
    .set({
      status: input.status,
      ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
      ...(input.errorMessage !== undefined
        ? { errorMessage: input.errorMessage }
        : {}),
      updatedAt: new Date().toISOString()
    })
    .where(eq(mediaRenditions.id, input.id))
    .returning();

  return rendition;
}

export async function markMediaRenditionReady(input: {
  id: number;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  width: number;
  height: number;
  durationTicks: number;
  rendererVersion: string;
}): Promise<MediaRendition> {
  const [rendition] = await db
    .update(mediaRenditions)
    .set({
      status: "ready",
      objectKey: input.objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      width: input.width,
      height: input.height,
      durationTicks: input.durationTicks,
      rendererVersion: input.rendererVersion,
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date().toISOString()
    })
    .where(eq(mediaRenditions.id, input.id))
    .returning();

  return rendition;
}

export async function resetMediaRenditionForRetry(
  rendition: MediaRendition
): Promise<{ rendition: MediaRendition; reset: boolean }> {
  const [updated] = await db
    .update(mediaRenditions)
    .set({
      status: "queued",
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date().toISOString()
    })
    .where(
      and(
        eq(mediaRenditions.id, rendition.id),
        eq(mediaRenditions.status, "failed")
      )
    )
    .returning();

  return { rendition: updated ?? rendition, reset: Boolean(updated) };
}
