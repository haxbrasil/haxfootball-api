import {
  bulkUpsertValuesBodySchema,
  type BulkUpsertValuesInput
} from "@/features/localization/_shared/http/inputs";
import type { ValueResponse } from "@/features/localization/_shared/http/responses";
import {
  bulkUpsertValueRows,
  getValueRows
} from "@/features/localization/_shared/db/queries";
import { toValueResponse } from "@/features/localization/_shared/http/responses";
import { valueResponseSchema } from "@/features/localization/_shared/http/responses";

export { bulkUpsertValuesBodySchema, valueResponseSchema };

export async function bulkUpsertValues(
  input: BulkUpsertValuesInput
): Promise<ValueResponse[]> {
  await bulkUpsertValueRows(input);

  const uniqueValues = Array.from(
    new Set(input.values.map((value) => value.value))
  );

  return Promise.all(
    uniqueValues.map(async (value) =>
      toValueResponse(value, await getValueRows(value))
    )
  );
}
