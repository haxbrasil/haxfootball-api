import { getClipRow } from "@/features/clips/_shared/db/queries";
import type { ClipResponse } from "@/features/clips/_shared/http/responses";
import { toClipResponse } from "@/features/clips/_shared/http/responses";
import { notFound } from "@/shared/http/errors";

export async function getClip(publicId: string): Promise<ClipResponse> {
  const row = await getClipRow(publicId);

  if (!row) {
    throw notFound("Clip not found");
  }

  return toClipResponse(row);
}
