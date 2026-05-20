import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { languages, values } from "@/features/localization/db";
import type { BulkUpsertValuesInput } from "@/features/localization/_shared/http/inputs";
import type { ValueWithLanguage } from "@/features/localization/_shared/http/responses";
import { notFound } from "@/shared/http/errors";
import { cursorAfter, cursorSort, pageLimit, type PaginationQuery } from "@lib";

export const fallbackLanguageCode = "en";

export async function listLanguageRows(query: PaginationQuery = {}) {
  return db
    .select()
    .from(languages)
    .where(cursorAfter(languages.id, query.cursor, "asc"))
    .orderBy(cursorSort(languages.id, "asc"))
    .limit(pageLimit(query));
}

export async function getValueRows(
  value: string
): Promise<ValueWithLanguage[]> {
  const rows = await db
    .select({
      value: values,
      language: languages
    })
    .from(values)
    .innerJoin(languages, eq(values.languageId, languages.id))
    .where(eq(values.value, value))
    .orderBy(cursorSort(languages.id, "asc"));

  if (rows.length === 0) {
    throw notFound("Value not found");
  }

  return rows;
}

export async function bulkUpsertValueRows(input: BulkUpsertValuesInput) {
  const languageByCode = await ensureLanguages(
    Array.from(new Set(input.values.map((value) => value.language)))
  );
  const now = new Date().toISOString();

  for (const value of input.values) {
    const language = languageByCode.get(value.language);

    if (!language) {
      throw notFound("Language not found");
    }

    await db
      .insert(values)
      .values({
        value: value.value,
        languageId: language.id,
        label: value.label,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [values.value, values.languageId],
        set: {
          label: value.label,
          updatedAt: now
        }
      });
  }
}

export async function resolveLabels(
  requestedValues: string[],
  languageCode?: string | null
): Promise<Map<string, string>> {
  const uniqueValues = Array.from(new Set(requestedValues));
  const labels = new Map(uniqueValues.map((value) => [value, value]));

  if (uniqueValues.length === 0) {
    return labels;
  }

  const requestedLanguage = languageCode?.trim().toLowerCase();
  const languageCodes = Array.from(
    new Set(
      [requestedLanguage, fallbackLanguageCode].filter(
        (code): code is string => !!code
      )
    )
  );
  const rows = await db
    .select({
      value: values,
      language: languages
    })
    .from(values)
    .innerJoin(languages, eq(values.languageId, languages.id))
    .where(
      and(
        inArray(values.value, uniqueValues),
        inArray(languages.code, languageCodes)
      )
    );

  for (const row of rows) {
    if (row.language.code === fallbackLanguageCode) {
      labels.set(row.value.value, row.value.label);
    }
  }

  if (requestedLanguage) {
    for (const row of rows) {
      if (row.language.code === requestedLanguage) {
        labels.set(row.value.value, row.value.label);
      }
    }
  }

  return labels;
}

async function ensureLanguages(codes: string[]) {
  const existingRows = await db
    .select()
    .from(languages)
    .where(inArray(languages.code, codes));
  const languageByCode = new Map(
    existingRows.map((language) => [language.code, language])
  );

  for (const code of codes) {
    if (languageByCode.has(code)) {
      continue;
    }

    const now = new Date().toISOString();
    const [language] = await db
      .insert(languages)
      .values({
        code,
        name: code,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    languageByCode.set(code, language);
  }

  return languageByCode;
}
