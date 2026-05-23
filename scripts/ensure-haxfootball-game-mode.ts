Bun.env.APP_API_KEY ??= "data-maintenance";
Bun.env.JWT_SECRET ??= "data-maintenance";
Bun.env.R2_ENDPOINT ??= "https://example.com";
Bun.env.R2_ACCESS_KEY_ID ??= "data-maintenance";
Bun.env.R2_SECRET_ACCESS_KEY ??= "data-maintenance";

export {};

const { eq, isNull } = await import("drizzle-orm");
const { db } = await import("../src/db/client");
const { gameModes } = await import("../src/features/game-modes/db");
const { languages, values } = await import("../src/features/localization/db");
const { matches } = await import("../src/features/matches/db");

const gameModeName = "haxfootball";
const title = "game-mode.haxfootball.title";
const description = "game-mode.haxfootball.description";

const labels = [
  {
    value: title,
    language: "en",
    label: "HaxFootball"
  },
  {
    value: title,
    language: "pt-br",
    label: "HaxFootball"
  },
  {
    value: description,
    language: "en",
    label: "Default HaxFootball game mode."
  },
  {
    value: description,
    language: "pt-br",
    label: "Modo de jogo padrao do HaxFootball."
  }
];

await db.transaction(async (tx) => {
  const now = new Date().toISOString();
  const languageByCode = new Map<string, { id: number }>();

  for (const languageCode of new Set(labels.map((label) => label.language))) {
    const [existingLanguage] = await tx
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.code, languageCode));

    if (existingLanguage) {
      languageByCode.set(languageCode, existingLanguage);
      continue;
    }

    const [language] = await tx
      .insert(languages)
      .values({
        code: languageCode,
        name: languageCode,
        createdAt: now,
        updatedAt: now
      })
      .returning({ id: languages.id });

    languageByCode.set(languageCode, language);
  }

  for (const label of labels) {
    const language = languageByCode.get(label.language);

    if (!language) {
      throw new Error(`Missing language: ${label.language}`);
    }

    await tx
      .insert(values)
      .values({
        value: label.value,
        languageId: language.id,
        label: label.label,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [values.value, values.languageId],
        set: {
          label: label.label,
          updatedAt: now
        }
      });
  }

  const [existingGameMode] = await tx
    .select({ id: gameModes.id })
    .from(gameModes)
    .where(eq(gameModes.name, gameModeName));

  const gameMode =
    existingGameMode ??
    (
      await tx
        .insert(gameModes)
        .values({
          name: gameModeName,
          title,
          description,
          visibility: "visible",
          rank: 0,
          createdAt: now,
          updatedAt: now
        })
        .returning({ id: gameModes.id })
    )[0];

  if (!gameMode) {
    throw new Error("Failed to ensure HaxFootball game mode");
  }

  await tx
    .update(matches)
    .set({
      gameModeId: gameMode.id,
      updatedAt: now
    })
    .where(isNull(matches.gameModeId));
});

console.log("Ensured haxfootball game mode and backfilled unassigned matches.");
