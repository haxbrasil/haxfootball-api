CREATE TABLE `recording_inspections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recording_id` integer NOT NULL,
	`state` text NOT NULL,
	`profile` text NOT NULL,
	`issues` text NOT NULL,
	`decoder_version` text NOT NULL,
	`checked_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recording_inspections_recording_id_unique` ON `recording_inspections` (`recording_id`);--> statement-breakpoint
CREATE INDEX `recording_inspections_state_checked_idx` ON `recording_inspections` (`state`,`checked_at`);