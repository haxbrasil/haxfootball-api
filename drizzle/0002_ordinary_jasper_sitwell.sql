CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `roles` (`id`, `uuid`, `name`, `created_at`, `updated_at`)
VALUES (
	1,
	lower(
		hex(randomblob(4)) || '-' ||
		hex(randomblob(2)) || '-4' ||
		substr(hex(randomblob(2)), 2) || '-' ||
		substr('89ab', abs(random()) % 4 + 1, 1) ||
		substr(hex(randomblob(2)), 2) || '-' ||
		hex(randomblob(6))
	),
	'default',
	CURRENT_TIMESTAMP,
	CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_uuid_unique` ON `roles` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `role_id` integer DEFAULT 1 NOT NULL;
