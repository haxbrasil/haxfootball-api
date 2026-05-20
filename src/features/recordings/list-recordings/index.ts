import { db } from "@/db/client";
import type { RecordingResponse } from "@/features/recordings/_shared/http/responses";
import {
  listRecordingsResponseSchema,
  toRecordingResponse
} from "@/features/recordings/_shared/http/responses";
import { recordings } from "@/features/recordings/db";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export { listRecordingsResponseSchema };

export async function listRecordings(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<RecordingResponse>> {
  const recordingRows = await db
    .select()
    .from(recordings)
    .where(cursorAfter(recordings.id, query.cursor, "desc"))
    .orderBy(cursorSort(recordings.id, "desc"))
    .limit(pageLimit(query));

  const page = pageItems(recordingRows, query, (recording) => recording.id);

  return {
    items: page.items.map(toRecordingResponse),
    page: page.page
  };
}
