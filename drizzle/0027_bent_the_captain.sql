PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP INDEX `event_schema_versions_family_id_version_unique`;--> statement-breakpoint
CREATE TABLE `__new_event_schema_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` integer NOT NULL,
	`version` integer NOT NULL,
	`definition` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `event_schema_families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_event_schema_versions`("id", "family_id", "version", "definition", "created_at", "updated_at") SELECT "id", "family_id", "version", "definition", "created_at", "updated_at" FROM `event_schema_versions`;--> statement-breakpoint
DROP TABLE `event_schema_versions`;--> statement-breakpoint
ALTER TABLE `__new_event_schema_versions` RENAME TO `event_schema_versions`;--> statement-breakpoint
CREATE UNIQUE INDEX `event_schema_versions_family_id_version_unique` ON `event_schema_versions` (`family_id`,`version`);--> statement-breakpoint
CREATE TABLE `__new_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`status` text NOT NULL,
	`completion_reason` text,
	`session_id` text,
	`room_instance_id` integer,
	`last_checkpoint_at` text,
	`last_checkpoint_revision` integer DEFAULT 0 NOT NULL,
	`elapsed_seconds` real,
	`last_producer_sequence` integer DEFAULT 0 NOT NULL,
	`recording_checkpoint_revision` integer DEFAULT 0 NOT NULL,
	`recording_checkpoint_object_key` text,
	`recording_checkpoint_sha256` text,
	`recording_checkpoint_size_bytes` integer,
	`recording_id` integer,
	`game_mode_id` integer,
	`event_schema_version_id` integer,
	`initiated_at` text,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_instance_id`) REFERENCES `room_instances`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_mode_id`) REFERENCES `game_modes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_schema_version_id`) REFERENCES `event_schema_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_matches`("id", "public_id", "status", "completion_reason", "session_id", "room_instance_id", "last_checkpoint_at", "last_checkpoint_revision", "elapsed_seconds", "last_producer_sequence", "recording_checkpoint_revision", "recording_checkpoint_object_key", "recording_checkpoint_sha256", "recording_checkpoint_size_bytes", "recording_id", "game_mode_id", "event_schema_version_id", "initiated_at", "ended_at", "created_at", "updated_at") SELECT "id", "public_id", "status", "completion_reason", "session_id", "room_instance_id", "last_checkpoint_at", "last_checkpoint_revision", "elapsed_seconds", "last_producer_sequence", "recording_checkpoint_revision", "recording_checkpoint_object_key", "recording_checkpoint_sha256", "recording_checkpoint_size_bytes", "recording_id", "game_mode_id", "event_schema_version_id", "initiated_at", "ended_at", "created_at", "updated_at" FROM `matches`;--> statement-breakpoint
DROP TABLE `matches`;--> statement-breakpoint
ALTER TABLE `__new_matches` RENAME TO `matches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `matches_public_id_unique` ON `matches` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_session_id_unique` ON `matches` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_recording_id_unique` ON `matches` (`recording_id`);--> statement-breakpoint
CREATE INDEX `matches_room_instance_status_idx` ON `matches` (`room_instance_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_id_event_schema_version_id_unique` ON `matches` (`id`,`event_schema_version_id`);
