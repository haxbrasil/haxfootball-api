CREATE TABLE `room_program_version_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`program_id` integer NOT NULL,
	`alias` text NOT NULL,
	`version_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `room_programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `room_program_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_program_version_aliases_uuid_unique` ON `room_program_version_aliases` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_program_version_aliases_program_id_alias_unique` ON `room_program_version_aliases` (`program_id`,`alias`);