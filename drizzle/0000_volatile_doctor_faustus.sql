CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`external_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_uuid_unique` ON `accounts` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_external_id_unique` ON `accounts` (`external_id`);