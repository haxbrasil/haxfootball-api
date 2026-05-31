PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP INDEX `matches_id_stat_event_schema_version_id_unique`;--> statement-breakpoint
DROP INDEX `match_stat_events_uuid_unique`;--> statement-breakpoint
DROP INDEX `match_stat_events_match_id_sequence_unique`;--> statement-breakpoint
DROP INDEX `stat_event_schema_families_uuid_unique`;--> statement-breakpoint
DROP INDEX `stat_event_schema_families_name_unique`;--> statement-breakpoint
DROP INDEX `stat_event_schema_versions_family_id_version_unique`;--> statement-breakpoint
ALTER TABLE `stat_event_schema_families` RENAME TO `event_schema_families`;--> statement-breakpoint
ALTER TABLE `stat_event_schema_versions` RENAME TO `event_schema_versions`;--> statement-breakpoint
ALTER TABLE `matches` RENAME COLUMN "stat_event_schema_version_id" TO "event_schema_version_id";--> statement-breakpoint
CREATE TABLE `match_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`match_id` integer NOT NULL,
	`schema_version_id` integer,
	`sequence` integer NOT NULL,
	`domain` text NOT NULL,
	`type` text NOT NULL,
	`scope` text NOT NULL,
	`actor_player_id` integer,
	`subject_player_id` integer,
	`team` text,
	`room_player_id` integer,
	`play_id` text,
	`source_state` text,
	`value` text,
	`occurred_at` text,
	`elapsed_seconds` real,
	`tick` real,
	`disabled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`schema_version_id`) REFERENCES `event_schema_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`,`schema_version_id`) REFERENCES `matches`(`id`,`event_schema_version_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "match_events_value_json_valid" CHECK(json_valid("match_events"."value"))
);
--> statement-breakpoint
INSERT INTO `match_events`(
	"id",
	"uuid",
	"match_id",
	"schema_version_id",
	"sequence",
	"domain",
	"type",
	"scope",
	"actor_player_id",
	"subject_player_id",
	"team",
	"room_player_id",
	"play_id",
	"source_state",
	"value",
	"occurred_at",
	"elapsed_seconds",
	"tick",
	"disabled_at",
	"created_at",
	"updated_at"
)
WITH combined_events AS (
	SELECT
		`match_stat_events`.`id` AS source_id,
		`match_stat_events`.`uuid` AS uuid,
		`match_stat_events`.`match_id` AS match_id,
		`match_stat_events`.`schema_version_id` AS schema_version_id,
		`match_stat_events`.`sequence` AS source_sequence,
		1 AS source_priority,
		'game' AS domain,
		`match_stat_events`.`type` AS type,
		'player' AS scope,
		`match_stat_events`.`player_id` AS actor_player_id,
		NULL AS subject_player_id,
		NULL AS team,
		NULL AS room_player_id,
		NULL AS play_id,
		NULL AS source_state,
		`match_stat_events`.`value` AS value,
		`match_stat_events`.`occurred_at` AS occurred_at,
		NULL AS elapsed_seconds,
		`match_stat_events`.`tick` AS tick,
		`match_stat_events`.`disabled_at` AS disabled_at,
		`match_stat_events`.`created_at` AS created_at,
		`match_stat_events`.`updated_at` AS updated_at
	FROM `match_stat_events`
	UNION ALL
	SELECT
		`match_player_events`.`id` AS source_id,
		lower(
			hex(randomblob(4)) || '-' ||
			hex(randomblob(2)) || '-4' ||
			substr(hex(randomblob(2)), 2) || '-' ||
			substr('89ab', abs(random()) % 4 + 1, 1) ||
			substr(hex(randomblob(2)), 2) || '-' ||
			hex(randomblob(6))
		) AS uuid,
		`match_player_events`.`match_id` AS match_id,
		`matches`.`event_schema_version_id` AS schema_version_id,
		`match_player_events`.`sequence` AS source_sequence,
		0 AS source_priority,
		'room' AS domain,
		CASE `match_player_events`.`type`
			WHEN 'player_join' THEN 'player-joined'
			WHEN 'player_leave' THEN 'player-left'
			WHEN 'player_team_change' THEN 'player-team-changed'
			ELSE replace(`match_player_events`.`type`, '_', '-')
		END AS type,
		'player' AS scope,
		`match_player_events`.`player_id` AS actor_player_id,
		NULL AS subject_player_id,
		`match_player_events`.`team` AS team,
		`match_player_events`.`room_player_id` AS room_player_id,
		NULL AS play_id,
		NULL AS source_state,
		'{}' AS value,
		`match_player_events`.`occurred_at` AS occurred_at,
		`match_player_events`.`elapsed_seconds` AS elapsed_seconds,
		NULL AS tick,
		NULL AS disabled_at,
		`match_player_events`.`created_at` AS created_at,
		`match_player_events`.`created_at` AS updated_at
	FROM `match_player_events`
	INNER JOIN `matches` ON `matches`.`id` = `match_player_events`.`match_id`
),
sequenced_events AS (
	SELECT
		combined_events.*,
		row_number() OVER (
			PARTITION BY combined_events.match_id
			ORDER BY
				combined_events.occurred_at IS NULL,
				combined_events.occurred_at,
				combined_events.source_sequence,
				combined_events.source_priority,
				combined_events.source_id
		) AS ledger_sequence
	FROM combined_events
)
SELECT
	NULL,
	uuid,
	match_id,
	schema_version_id,
	ledger_sequence,
	domain,
	type,
	scope,
	actor_player_id,
	subject_player_id,
	team,
	room_player_id,
	play_id,
	source_state,
	value,
	occurred_at,
	elapsed_seconds,
	tick,
	disabled_at,
	created_at,
	updated_at
FROM sequenced_events;--> statement-breakpoint
DROP TABLE `match_stat_events`;--> statement-breakpoint
DROP TABLE `match_player_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `match_events_uuid_unique` ON `match_events` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_events_match_id_sequence_unique` ON `match_events` (`match_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_schema_families_uuid_unique` ON `event_schema_families` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_schema_families_name_unique` ON `event_schema_families` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_schema_versions_family_id_version_unique` ON `event_schema_versions` (`family_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_id_event_schema_version_id_unique` ON `matches` (`id`,`event_schema_version_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
