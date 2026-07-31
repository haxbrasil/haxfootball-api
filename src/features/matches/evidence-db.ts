import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { composedMatches, matches } from "@/features/matches/db";
import { recordings } from "@/features/recordings/db";

export const logicalMatchEvidenceClaims = sqliteTable(
  "logical_match_evidence_claims",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    consumerKind: text("consumer_kind").notNull(),
    consumerUuid: text("consumer_uuid").notNull(),
    logicalKind: text("logical_kind", {
      enum: ["physical", "composed"]
    }).notNull(),
    physicalMatchId: integer("physical_match_id").references(() => matches.id),
    composedMatchId: integer("composed_match_id").references(
      () => composedMatches.id
    ),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("logical_match_evidence_claims_consumer_unique").on(
      table.consumerKind,
      table.consumerUuid
    ),
    check(
      "logical_match_evidence_claims_source_check",
      sql`((${table.physicalMatchId} is not null) + (${table.composedMatchId} is not null)) = 1`
    )
  ]
);

export const logicalMatchEvidenceClaimRounds = sqliteTable(
  "logical_match_evidence_claim_rounds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    claimId: integer("claim_id")
      .notNull()
      .references(() => logicalMatchEvidenceClaims.id),
    physicalMatchId: integer("physical_match_id")
      .notNull()
      .references(() => matches.id),
    position: integer("position").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("logical_match_evidence_rounds_physical_unique").on(
      table.physicalMatchId
    ),
    uniqueIndex("logical_match_evidence_rounds_position_unique").on(
      table.claimId,
      table.position
    ),
    index("logical_match_evidence_rounds_claim_idx").on(table.claimId, table.id)
  ]
);

export type LogicalMatchEvidenceClaim =
  typeof logicalMatchEvidenceClaims.$inferSelect;

export const recordingInspections = sqliteTable(
  "recording_inspections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordingId: integer("recording_id")
      .notNull()
      .references(() => recordings.id)
      .unique(),
    state: text("state", {
      enum: ["playable", "invalid", "unsupported"]
    }).notNull(),
    profile: text("profile", { enum: ["structural", "strict"] }).notNull(),
    issues: text("issues", { mode: "json" })
      .$type<
        Array<{
          code: string;
          severity: "error" | "warning";
          path: string;
          message: string;
        }>
      >()
      .notNull(),
    decoderVersion: text("decoder_version").notNull(),
    checkedAt: text("checked_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("recording_inspections_state_checked_idx").on(
      table.state,
      table.checkedAt
    )
  ]
);
