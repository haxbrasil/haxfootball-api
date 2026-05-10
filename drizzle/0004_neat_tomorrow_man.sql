CREATE TABLE `recordings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`sha256` text NOT NULL,
	`object_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recordings_public_id_unique` ON `recordings` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recordings_sha256_unique` ON `recordings` (`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `recordings_object_key_unique` ON `recordings` (`object_key`);