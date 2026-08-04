import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { accounts } from "@/features/accounts/db";
import { championships } from "@/features/championships/core/db";
import { championshipMatches } from "@/features/championships/format-scheduling/db";
import {
  championshipParticipants,
  championshipTeams
} from "@/features/championships/people/db";
import { eventSchemaVersions } from "@/features/event-schemas/db";
import { composedMatches, matches } from "@/features/matches/db";
import { players } from "@/features/players/db";
import { roomPrograms, roomProgramVersions } from "@/features/rooms/core-db";

export const championshipMatchEvidence = sqliteTable(
  "championship_match_evidence",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipMatchId: integer("championship_match_id")
      .notNull()
      .references(() => championshipMatches.id)
      .unique(),
    physicalMatchId: integer("physical_match_id").references(() => matches.id),
    composedMatchId: integer("composed_match_id").references(
      () => composedMatches.id
    ),
    logicalPublicIdSnapshot: text("logical_public_id_snapshot").notNull(),
    scoreMode: text("score_mode", {
      enum: ["cumulative", "per-game", "last-round"]
    })
      .notNull()
      .default("cumulative"),
    orientation: text("orientation", {
      enum: ["aligned", "swapped"]
    }).notNull(),
    quality: text("quality", {
      enum: ["complete", "recovered", "partial", "historical", "unknown"]
    }).notNull(),
    attachedByAccountId: integer("attached_by_account_id")
      .notNull()
      .references(() => accounts.id),
    note: text("note"),
    attachedAt: text("attached_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_match_evidence_physical_unique").on(
      table.physicalMatchId
    ),
    uniqueIndex("championship_match_evidence_composed_unique").on(
      table.composedMatchId
    ),
    check(
      "championship_match_evidence_source_check",
      sql`((${table.physicalMatchId} is not null) + (${table.composedMatchId} is not null)) = 1`
    )
  ]
);

export const championshipMatchEvidenceRounds = sqliteTable(
  "championship_match_evidence_rounds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    evidenceId: integer("evidence_id")
      .notNull()
      .references(() => championshipMatchEvidence.id),
    physicalMatchId: integer("physical_match_id")
      .notNull()
      .references(() => matches.id),
    position: integer("position").notNull(),
    kind: text("kind", { enum: ["sequential", "extra-time"] }).notNull(),
    orientation: text("orientation", {
      enum: ["aligned", "swapped"]
    }).notNull(),
    sideAScore: integer("side_a_score"),
    sideBScore: integer("side_b_score"),
    completionReason: text("completion_reason"),
    elapsedSeconds: real("elapsed_seconds"),
    lastCheckpointAt: text("last_checkpoint_at"),
    recordingState: text("recording_state", {
      enum: ["available", "missing", "invalid", "unknown"]
    }).notNull(),
    roomProgramId: integer("room_program_id").references(() => roomPrograms.id),
    roomProgramVersionId: integer("room_program_version_id").references(
      () => roomProgramVersions.id
    ),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_evidence_rounds_physical_unique").on(
      table.physicalMatchId
    ),
    uniqueIndex("championship_evidence_rounds_position_unique").on(
      table.evidenceId,
      table.position
    )
  ]
);

export const championshipMatchResultRevisions = sqliteTable(
  "championship_match_result_revisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    championshipMatchId: integer("championship_match_id")
      .notNull()
      .references(() => championshipMatches.id),
    revision: integer("revision").notNull(),
    state: text("state", {
      enum: ["current", "superseded", "invalidated"]
    }).notNull(),
    sideATeamId: integer("side_a_team_id").references(
      () => championshipTeams.id
    ),
    sideBTeamId: integer("side_b_team_id").references(
      () => championshipTeams.id
    ),
    method: text("method", {
      enum: [
        "played",
        "manual",
        "full-forfeit",
        "mid-game-forfeit",
        "double-forfeit",
        "historical"
      ]
    }).notNull(),
    sideAPlayedScore: integer("side_a_played_score").notNull(),
    sideBPlayedScore: integer("side_b_played_score").notNull(),
    sideAAdministrativeScore: integer("side_a_administrative_score")
      .notNull()
      .default(0),
    sideBAdministrativeScore: integer("side_b_administrative_score")
      .notNull()
      .default(0),
    sideAOfficialScore: integer("side_a_official_score").notNull(),
    sideBOfficialScore: integer("side_b_official_score").notNull(),
    sideAOutcome: text("side_a_outcome", {
      enum: ["win", "loss", "draw"]
    }).notNull(),
    sideBOutcome: text("side_b_outcome", {
      enum: ["win", "loss", "draw"]
    }).notNull(),
    evidenceDerived: integer("evidence_derived", { mode: "boolean" })
      .notNull()
      .default(false),
    note: text("note"),
    settledByAccountId: integer("settled_by_account_id").references(
      () => accounts.id
    ),
    settledAt: text("settled_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    supersededAt: text("superseded_at"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_result_revisions_unique").on(
      table.championshipMatchId,
      table.revision
    ),
    index("championship_result_revisions_current_idx").on(
      table.championshipId,
      table.state,
      table.id
    ),
    check(
      "championship_result_official_score_a_check",
      sql`${table.sideAOfficialScore} = ${table.sideAPlayedScore} + ${table.sideAAdministrativeScore}`
    ),
    check(
      "championship_result_official_score_b_check",
      sql`${table.sideBOfficialScore} = ${table.sideBPlayedScore} + ${table.sideBAdministrativeScore}`
    )
  ]
);

export const championshipMatchAppearances = sqliteTable(
  "championship_match_appearances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    resultRevisionId: integer("result_revision_id")
      .notNull()
      .references(() => championshipMatchResultRevisions.id),
    sourcePlayerId: integer("source_player_id")
      .notNull()
      .references(() => players.id),
    sourceAccountId: integer("source_account_id").references(() => accounts.id),
    observedSide: text("observed_side", { enum: ["a", "b"] }).notNull(),
    playingTimeSeconds: real("playing_time_seconds").notNull(),
    registered: integer("registered", { mode: "boolean" }).notNull(),
    onRoster: integer("on_roster", { mode: "boolean" }).notNull(),
    displayNameSnapshot: text("display_name_snapshot").notNull(),
    findings: text("findings", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_match_appearances_player_unique").on(
      table.resultRevisionId,
      table.sourcePlayerId
    )
  ]
);

export const championshipMatchAttributions = sqliteTable(
  "championship_match_attributions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    resultRevisionId: integer("result_revision_id")
      .notNull()
      .references(() => championshipMatchResultRevisions.id),
    sourcePlayerId: integer("source_player_id")
      .notNull()
      .references(() => players.id),
    mode: text("mode", { enum: ["default", "exclude", "redirect"] })
      .notNull()
      .default("default"),
    targetParticipantId: integer("target_participant_id").references(
      () => championshipParticipants.id
    ),
    actorAccountId: integer("actor_account_id")
      .notNull()
      .references(() => accounts.id),
    reason: text("reason"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_match_attributions_player_unique").on(
      table.resultRevisionId,
      table.sourcePlayerId
    ),
    check(
      "championship_match_attributions_target_check",
      sql`(${table.mode} = 'redirect' and ${table.targetParticipantId} is not null) or (${table.mode} <> 'redirect' and ${table.targetParticipantId} is null)`
    )
  ]
);

export const championshipMetricMappings = sqliteTable(
  "championship_metric_mappings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    canonicalMetricKey: text("canonical_metric_key").notNull(),
    sourceEventSchemaVersionId: integer("source_event_schema_version_id")
      .notNull()
      .references(() => eventSchemaVersions.id),
    sourceMetricKey: text("source_metric_key").notNull(),
    displayLabel: text("display_label").notNull(),
    valueKind: text("value_kind", {
      enum: ["integer", "number", "duration", "percentage"]
    }).notNull(),
    aggregation: text("aggregation", {
      enum: ["sum", "average", "maximum", "minimum"]
    }).notNull(),
    revision: integer("revision").notNull().default(0),
    actorAccountId: integer("actor_account_id").references(() => accounts.id),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("championship_metric_mappings_source_unique").on(
      table.championshipId,
      table.sourceEventSchemaVersionId,
      table.sourceMetricKey
    ),
    index("championship_metric_mappings_canonical_idx").on(
      table.championshipId,
      table.canonicalMetricKey,
      table.id
    )
  ]
);

export const championshipStatisticEntries = sqliteTable(
  "championship_statistic_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    championshipId: integer("championship_id")
      .notNull()
      .references(() => championships.id),
    resultRevisionId: integer("result_revision_id")
      .notNull()
      .references(() => championshipMatchResultRevisions.id),
    participantId: integer("participant_id").references(
      () => championshipParticipants.id
    ),
    sourcePlayerId: integer("source_player_id").references(() => players.id),
    displayNameSnapshot: text("display_name_snapshot"),
    teamId: integer("team_id").references(() => championshipTeams.id),
    sourceEventSchemaVersionId: integer(
      "source_event_schema_version_id"
    ).references(() => eventSchemaVersions.id),
    sourceRoomProgramId: integer("source_room_program_id").references(
      () => roomPrograms.id
    ),
    metricKey: text("metric_key").notNull(),
    numericValue: real("numeric_value").notNull(),
    source: text("source", {
      enum: ["gameplay", "participation", "administrative"]
    }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    index("championship_statistics_participant_metric_idx").on(
      table.championshipId,
      table.participantId,
      table.metricKey,
      table.id
    ),
    index("championship_statistics_team_metric_idx").on(
      table.championshipId,
      table.teamId,
      table.metricKey,
      table.id
    )
  ]
);

export type ChampionshipMatchResultRevision =
  typeof championshipMatchResultRevisions.$inferSelect;
