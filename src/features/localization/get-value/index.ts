import {
  toValueResponse,
  valueResponseSchema,
  type ValueResponse
} from "@/features/localization/_shared/http/responses";
import { getValueRows } from "@/features/localization/_shared/db/queries";

export { valueResponseSchema };

export async function getValue(value: string): Promise<ValueResponse> {
  return toValueResponse(value, await getValueRows(value));
}
