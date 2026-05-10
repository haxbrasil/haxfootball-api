import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import type { StatEventSchemaRow } from "@/features/stat-event-schemas/stat-event-schema.contract";
import {
  statEventSchemaFamilies,
  statEventSchemaVersions
} from "@/features/stat-event-schemas/stat-event-schema.db";
import type { StatEventSchemaDefinition } from "@/features/stat-event-schemas/stat-event-schema.service";
import { notFound } from "@/shared/http/errors";

export async function listStatEventSchemaRows(): Promise<StatEventSchemaRow[]> {
  const rows = await db
    .select({
      family: statEventSchemaFamilies,
      version: statEventSchemaVersions
    })
    .from(statEventSchemaVersions)
    .innerJoin(
      statEventSchemaFamilies,
      eq(statEventSchemaVersions.familyId, statEventSchemaFamilies.id)
    )
    .orderBy(desc(statEventSchemaFamilies.createdAt), desc(statEventSchemaVersions.version));

  const latestByFamily = latestVersionByFamily(rows);

  return rows.map((row) => ({
    ...row,
    latestVersion: latestByFamily.get(row.family.id) ?? row.version.version
  }));
}

export async function getLatestStatEventSchemaRow(
  uuid: string
): Promise<StatEventSchemaRow> {
  const family = await getStatEventSchemaFamily(uuid);
  const [version] = await db
    .select()
    .from(statEventSchemaVersions)
    .where(eq(statEventSchemaVersions.familyId, family.id))
    .orderBy(desc(statEventSchemaVersions.version));

  if (!version) {
    throw notFound("Stat event schema not found");
  }

  return {
    family,
    version,
    latestVersion: version.version
  };
}

export async function getStatEventSchemaRow(
  uuid: string,
  versionNumber: number
): Promise<StatEventSchemaRow> {
  const family = await getStatEventSchemaFamily(uuid);
  const [version] = await db
    .select()
    .from(statEventSchemaVersions)
    .where(
      and(
        eq(statEventSchemaVersions.familyId, family.id),
        eq(statEventSchemaVersions.version, versionNumber)
      )
    );

  if (!version) {
    throw notFound("Stat event schema version not found");
  }

  const latest = await getLatestStatEventSchemaRow(uuid);

  return {
    family,
    version,
    latestVersion: latest.version.version
  };
}

export async function resolveStatEventSchemaVersion(
  uuid: string,
  versionNumber: number
) {
  const row = await getStatEventSchemaRow(uuid, versionNumber);

  return row.version;
}

export async function createStatEventSchemaVersion(input: {
  familyId: number;
  version: number;
  definition: StatEventSchemaDefinition;
}) {
  const [version] = await db
    .insert(statEventSchemaVersions)
    .values(input)
    .returning();

  return version;
}

async function getStatEventSchemaFamily(uuid: string) {
  const [family] = await db
    .select()
    .from(statEventSchemaFamilies)
    .where(eq(statEventSchemaFamilies.uuid, uuid));

  if (!family) {
    throw notFound("Stat event schema not found");
  }

  return family;
}

function latestVersionByFamily(
  rows: Array<{
    family: { id: number };
    version: { version: number };
  }>
): Map<number, number> {
  return rows.reduce((latestByFamily, row) => {
    const currentLatest = latestByFamily.get(row.family.id) ?? 0;
    const nextLatest = Math.max(currentLatest, row.version.version);

    latestByFamily.set(row.family.id, nextLatest);

    return latestByFamily;
  }, new Map<number, number>());
}
