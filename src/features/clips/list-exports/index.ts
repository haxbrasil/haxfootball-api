import { getClipRow } from "@/features/clips/_shared/db/queries";
import {
  toClipExportResponse,
  type ClipExportResponse
} from "@/features/clips/_shared/http/responses";
import { notFound } from "@/shared/http/errors";

export async function listClipExports(publicId: string): Promise<{
  items: ClipExportResponse[];
}> {
  const row = await getClipRow(publicId);
  if (!row) throw notFound("Clip not found");
  return {
    items: (row.renditions ?? [])
      .filter((rendition) => rendition.purpose === "clip_export")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(toClipExportResponse)
  };
}
