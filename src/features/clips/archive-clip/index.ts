import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clips } from "@/features/clips/db";
import { getClipRow } from "@/features/clips/_shared/db/queries";
import { notFound } from "@/shared/http/errors";

export async function archiveClip(publicId: string): Promise<void> {
  const current = await getClipRow(publicId);

  if (!current) {
    throw notFound("Clip not found");
  }

  await db
    .update(clips)
    .set({
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    .where(eq(clips.id, current.clip.id));
}
