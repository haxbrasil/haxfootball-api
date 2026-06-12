CREATE TABLE `room_instance_incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`room_instance_id` integer NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`player_id` integer,
	`tick` real,
	`reason` text,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`room_instance_id`) REFERENCES `room_instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_instance_incidents_uuid_unique` ON `room_instance_incidents` (`uuid`);