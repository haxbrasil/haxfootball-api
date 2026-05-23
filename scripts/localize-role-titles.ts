Bun.env.APP_API_KEY ??= "data-maintenance";
Bun.env.JWT_SECRET ??= "data-maintenance";
Bun.env.R2_ENDPOINT ??= "https://example.com";
Bun.env.R2_ACCESS_KEY_ID ??= "data-maintenance";
Bun.env.R2_SECRET_ACCESS_KEY ??= "data-maintenance";

export {};

const { eq } = await import("drizzle-orm");
const { db } = await import("../src/db/client");
const { languages, values } = await import("../src/features/localization/db");
const { roles } = await import("../src/features/roles/db");

const valueKeyPattern = /^[a-z][a-z0-9.-]{0,127}$/;

await db.transaction(async (tx) => {
  const now = new Date().toISOString();
  const [english] = await tx
    .insert(languages)
    .values({
      code: "en",
      name: "English",
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: languages.code,
      set: {
        name: "English",
        updatedAt: now
      }
    })
    .returning({ id: languages.id });

  const roleRows = await tx.select().from(roles);

  for (const role of roleRows) {
    if (valueKeyPattern.test(role.title)) {
      continue;
    }

    const value = `role.${role.name}.title`;

    await tx
      .insert(values)
      .values({
        value,
        languageId: english.id,
        label: role.title,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [values.value, values.languageId],
        set: {
          label: role.title,
          updatedAt: now
        }
      });

    await tx
      .update(roles)
      .set({
        title: value,
        updatedAt: now
      })
      .where(eq(roles.id, role.id));
  }
});

console.log("Localized existing role title strings into value keys.");
