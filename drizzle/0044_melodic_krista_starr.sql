CREATE TABLE `clips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`recording_id` integer NOT NULL,
	`start_tick` integer NOT NULL,
	`end_tick` integer NOT NULL,
	`title` text,
	`source_kind` text NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clips_public_id_unique` ON `clips` (`public_id`);--> statement-breakpoint
CREATE INDEX `clips_recording_idx` ON `clips` (`recording_id`,`id`);--> statement-breakpoint
ALTER TABLE `recordings` ADD `format` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `extension_version` integer;--> statement-breakpoint
ALTER TABLE `recordings` ADD `total_frames` integer;