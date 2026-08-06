import { getClipRow } from "@/features/clips/_shared/db/queries";
import type { CreateClipExportInput } from "@/features/clips/_shared/http/inputs";
import {
  toClipExportResponse,
  type ClipExportResponse
} from "@/features/clips/_shared/http/responses";
import { enqueueClipExport } from "@/features/media-renditions/_shared/domain/jobs";
import { notFound } from "@/shared/http/errors";

export async function createClipExport(
  publicId: string,
  input: CreateClipExportInput
): Promise<ClipExportResponse> {
  const row = await getClipRow(publicId);
  if (!row) throw notFound("Clip not found");

  await enqueueClipExport({
    clip: row.clip,
    recording: row.recording,
    profile: input
  });
  const refreshed = await getClipRow(publicId);
  const rendition = (refreshed?.renditions ?? [])
    .filter(
      (candidate) =>
        candidate.purpose === "clip_export" &&
        candidate.exportProfile?.format === input.format &&
        candidate.exportProfile?.orientation === input.orientation &&
        candidate.exportProfile?.scoreboard === input.scoreboard
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!rendition) throw new Error("Clip export could not be created");
  return toClipExportResponse(rendition);
}
