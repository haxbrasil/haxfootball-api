PRAGMA foreign_keys=OFF;
--> statement-breakpoint
BEGIN TRANSACTION;
--> statement-breakpoint
CREATE TABLE `__new_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_roles` (`id`, `uuid`, `name`, `title`, `created_at`, `updated_at`)
SELECT
	`id`,
	`uuid`,
	`name`,
	CASE
		WHEN `name` = 'default' THEN 'Default'
		ELSE `name`
	END,
	`created_at`,
	`updated_at`
FROM `roles`;
--> statement-breakpoint
DROP TABLE `roles`;
--> statement-breakpoint
ALTER TABLE `__new_roles` RENAME TO `roles`;
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_uuid_unique` ON `roles` (`uuid`);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);
--> statement-breakpoint
COMMIT;
--> statement-breakpoint
PRAGMA foreign_keys=ON;