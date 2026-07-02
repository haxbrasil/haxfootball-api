CREATE TABLE `room_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`room_id` integer NOT NULL,
	`name` text NOT NULL,
	`payload` text,
	`status` text NOT NULL,
	`result` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`sent_at` text,
	`completed_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `room_instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_commands_uuid_unique` ON `room_commands` (`uuid`);