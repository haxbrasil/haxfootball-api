import { pageItems, type PaginatedResponse } from "@lib";
import { listClipRows } from "@/features/clips/_shared/db/queries";
import type { ListClipsQuery } from "@/features/clips/_shared/http/inputs";
import type { ClipResponse } from "@/features/clips/_shared/http/responses";
import {
  listClipsResponseSchema,
  toClipResponse
} from "@/features/clips/_shared/http/responses";

export { listClipsResponseSchema };

export async function listClips(
  query: ListClipsQuery = {}
): Promise<PaginatedResponse<ClipResponse>> {
  const rows = await listClipRows(query);
  const page = pageItems(rows, query, (row) => row.clip.id);

  return {
    items: page.items.map(toClipResponse),
    page: page.page
  };
}
