CREATE TABLE `match_player_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`player_id` integer NOT NULL,
	`team` text,
	`room_player_id` integer,
	`occurred_at` text,
	`elapsed_seconds` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_player_events_match_id_sequence_unique` ON `match_player_events` (`match_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `match_player_stints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`team` text NOT NULL,
	`room_player_id` integer,
	`joined_at` text,
	`left_at` text,
	`joined_elapsed_seconds` real,
	`left_elapsed_seconds` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match_team_metadata` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`team` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_team_metadata_match_id_team_unique` ON `match_team_metadata` (`match_id`,`team`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`status` text NOT NULL,
	`recording_id` integer,
	`initiated_at` text,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_public_id_unique` ON `matches` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_recording_id_unique` ON `matches` (`recording_id`);