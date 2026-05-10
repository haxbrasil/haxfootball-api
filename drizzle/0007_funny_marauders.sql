CREATE TABLE `match_stat_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`match_id` integer NOT NULL,
	`schema_version_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`player_id` integer NOT NULL,
	`value` text,
	`occurred_at` text,
	`tick` real,
	`disabled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`schema_version_id`) REFERENCES `stat_event_schema_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`,`schema_version_id`) REFERENCES `matches`(`id`,`stat_event_schema_version_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "match_stat_events_value_json_valid" CHECK(json_valid("match_stat_events"."value"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_stat_events_uuid_unique` ON `match_stat_events` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_stat_events_match_id_sequence_unique` ON `match_stat_events` (`match_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `stat_event_schema_families` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stat_event_schema_families_uuid_unique` ON `stat_event_schema_families` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `stat_event_schema_families_name_unique` ON `stat_event_schema_families` (`name`);--> statement-breakpoint
CREATE TABLE `stat_event_schema_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` integer NOT NULL,
	`version` integer NOT NULL,
	`definition` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `stat_event_schema_families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stat_event_schema_versions_family_id_version_unique` ON `stat_event_schema_versions` (`family_id`,`version`);--> statement-breakpoint
ALTER TABLE `matches` ADD `stat_event_schema_version_id` integer REFERENCES stat_event_schema_versions(id);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_id_stat_event_schema_version_id_unique` ON `matches` (`id`,`stat_event_schema_version_id`);
