import {
  listLanguagesResponseSchema,
  toLanguageResponse,
  type LanguageResponse
} from "@/features/localization/_shared/http/responses";
import { listLanguageRows } from "@/features/localization/_shared/db/queries";
import { pageItems, type PaginatedResponse, type PaginationQuery } from "@lib";

export { listLanguagesResponseSchema };

export async function listLanguages(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<LanguageResponse>> {
  const rows = await listLanguageRows(query);
  const page = pageItems(rows, query, (row) => row.id);

  return {
    items: page.items.map(toLanguageResponse),
    page: page.page
  };
}
