PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_championship_match_evidence_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evidence_id` integer NOT NULL,
	`physical_match_id` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`orientation` text NOT NULL,
	`side_a_score` integer,
	`side_b_score` integer,
	`completion_reason` text,
	`elapsed_seconds` real,
	`last_checkpoint_at` text,
	`recording_state` text NOT NULL,
	`room_program_id` integer,
	`room_program_version_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`evidence_id`) REFERENCES `championship_match_evidence`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`physical_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_program_id`) REFERENCES `room_programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_program_version_id`) REFERENCES `room_program_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_championship_match_evidence_rounds`("id", "evidence_id", "physical_match_id", "position", "kind", "orientation", "side_a_score", "side_b_score", "completion_reason", "elapsed_seconds", "last_checkpoint_at", "recording_state", "room_program_id", "room_program_version_id", "created_at") SELECT "id", "evidence_id", "physical_match_id", "position", "kind", "orientation", "side_a_score", "side_b_score", "completion_reason", "elapsed_seconds", "last_checkpoint_at", "recording_state", "room_program_id", "room_program_version_id", "created_at" FROM `championship_match_evidence_rounds`;--> statement-breakpoint
DROP TABLE `championship_match_evidence_rounds`;--> statement-breakpoint
ALTER TABLE `__new_championship_match_evidence_rounds` RENAME TO `championship_match_evidence_rounds`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `championship_evidence_rounds_physical_unique` ON `championship_match_evidence_rounds` (`physical_match_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_evidence_rounds_position_unique` ON `championship_match_evidence_rounds` (`evidence_id`,`position`);--> statement-breakpoint
ALTER TABLE `championship_statistic_entries` ADD `source_player_id` integer REFERENCES players(id);--> statement-breakpoint
ALTER TABLE `championship_statistic_entries` ADD `display_name_snapshot` text;--> statement-breakpoint
ALTER TABLE `championship_statistic_entries` ADD `source_event_schema_version_id` integer REFERENCES event_schema_versions(id);--> statement-breakpoint
ALTER TABLE `championship_statistic_entries` ADD `source_room_program_id` integer REFERENCES room_programs(id);