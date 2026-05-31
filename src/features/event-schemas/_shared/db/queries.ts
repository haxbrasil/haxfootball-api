import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { EventSchemaRow } from "@/features/event-schemas/_shared/http/responses";
import {
  eventSchemaFamilies,
  eventSchemaVersions
} from "@/features/event-schemas/db";
import type { EventSchemaDefinition } from "@/features/event-schemas/_shared/domain/definition";
import { notFound } from "@/shared/http/errors";
import { cursorAfter, cursorSort, pageLimit, type PaginationQuery } from "@lib";

export async function listEventSchemaRows(
  query: PaginationQuery = {}
): Promise<EventSchemaRow[]> {
  const rows = await db
    .select({
      family: eventSchemaFamilies,
      version: eventSchemaVersions
    })
    .from(eventSchemaVersions)
    .innerJoin(
      eventSchemaFamilies,
      eq(eventSchemaVersions.familyId, eventSchemaFamilies.id)
    )
    .where(cursorAfter(eventSchemaVersions.id, query.cursor, "asc"))
    .orderBy(cursorSort(eventSchemaVersions.id, "asc"))
    .limit(pageLimit(query));

  const latestRows = await db
    .select({
      familyId: eventSchemaVersions.familyId,
      latestVersion: sql<number>`max(${eventSchemaVersions.version})`
    })
    .from(eventSchemaVersions)
    .groupBy(eventSchemaVersions.familyId);
  const latestByFamily = latestVersionByFamily(latestRows);

  return rows.map((row) => ({
    ...row,
    latestVersion: latestByFamily.get(row.family.id) ?? row.version.version
  }));
}

export async function getLatestEventSchemaRow(
  uuid: string
): Promise<EventSchemaRow> {
  const family = await getEventSchemaFamily(uuid);
  const [version] = await db
    .select()
    .from(eventSchemaVersions)
    .where(eq(eventSchemaVersions.familyId, family.id))
    .orderBy(desc(eventSchemaVersions.version));

  if (!version) {
    throw notFound("Event schema not found");
  }

  return {
    family,
    version,
    latestVersion: version.version
  };
}

export async function getLatestEventSchemaRowByName(
  name: string
): Promise<EventSchemaRow> {
  const family = await getEventSchemaFamilyByName(name);
  const [version] = await db
    .select()
    .from(eventSchemaVersions)
    .where(eq(eventSchemaVersions.familyId, family.id))
    .orderBy(desc(eventSchemaVersions.version));

  if (!version) {
    throw notFound("Event schema not found");
  }

  return {
    family,
    version,
    latestVersion: version.version
  };
}

export async function getEventSchemaRow(
  uuid: string,
  versionNumber: number
): Promise<EventSchemaRow> {
  const family = await getEventSchemaFamily(uuid);
  const [version] = await db
    .select()
    .from(eventSchemaVersions)
    .where(
      and(
        eq(eventSchemaVersions.familyId, family.id),
        eq(eventSchemaVersions.version, versionNumber)
      )
    );

  if (!version) {
    throw notFound("Event schema version not found");
  }

  const latest = await getLatestEventSchemaRow(uuid);

  return {
    family,
    version,
    latestVersion: latest.version.version
  };
}

export async function getEventSchemaRowByName(
  name: string,
  versionNumber: number
): Promise<EventSchemaRow> {
  const family = await getEventSchemaFamilyByName(name);
  const [version] = await db
    .select()
    .from(eventSchemaVersions)
    .where(
      and(
        eq(eventSchemaVersions.familyId, family.id),
        eq(eventSchemaVersions.version, versionNumber)
      )
    );

  if (!version) {
    throw notFound("Event schema version not found");
  }

  const latest = await getLatestEventSchemaRowByName(name);

  return {
    family,
    version,
    latestVersion: latest.version.version
  };
}

export async function resolveEventSchemaVersion(
  uuid: string,
  versionNumber: number
) {
  const row = await getEventSchemaRow(uuid, versionNumber);

  return row.version;
}

export async function createEventSchemaVersion(input: {
  familyId: number;
  version: number;
  definition: EventSchemaDefinition;
}) {
  const [version] = await db
    .insert(eventSchemaVersions)
    .values(input)
    .returning();

  return version;
}

async function getEventSchemaFamily(uuid: string) {
  const [family] = await db
    .select()
    .from(eventSchemaFamilies)
    .where(eq(eventSchemaFamilies.uuid, uuid));

  if (!family) {
    throw notFound("Event schema not found");
  }

  return family;
}

async function getEventSchemaFamilyByName(name: string) {
  const [family] = await db
    .select()
    .from(eventSchemaFamilies)
    .where(eq(eventSchemaFamilies.name, name));

  if (!family) {
    throw notFound("Event schema not found");
  }

  return family;
}

function latestVersionByFamily(
  rows: Array<{
    familyId: number;
    latestVersion: number;
  }>
): Map<number, number> {
  return rows.reduce((latestByFamily, row) => {
    latestByFamily.set(row.familyId, row.latestVersion);

    return latestByFamily;
  }, new Map<number, number>());
}
