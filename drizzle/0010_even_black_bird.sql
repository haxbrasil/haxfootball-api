CREATE TABLE `permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`key` text NOT NULL,
	`title` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_uuid_unique` ON `permissions` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_key_unique` ON `permissions` (`key`);--> statement-breakpoint
INSERT INTO `permissions` (`uuid`, `key`, `title`, `created_at`, `updated_at`)
SELECT
	lower(
		hex(randomblob(4)) || '-' ||
		hex(randomblob(2)) || '-4' ||
		substr(hex(randomblob(2)), 2) || '-' ||
		substr('89ab', abs(random()) % 4 + 1, 1) ||
		substr(hex(randomblob(2)), 2) || '-' ||
		hex(randomblob(6))
	),
	`permission`,
	NULL,
	MIN(`created_at`),
	CURRENT_TIMESTAMP
FROM `role_permissions`
GROUP BY `permission`;--> statement-breakpoint
CREATE TABLE `__new_role_permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` integer NOT NULL,
	`permission_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_role_permissions` (`id`, `role_id`, `permission_id`, `created_at`)
SELECT
	`role_permissions`.`id`,
	`role_permissions`.`role_id`,
	`permissions`.`id`,
	`role_permissions`.`created_at`
FROM `role_permissions`
INNER JOIN `permissions` ON `permissions`.`key` = `role_permissions`.`permission`;--> statement-breakpoint
DROP TABLE `role_permissions`;--> statement-breakpoint
ALTER TABLE `__new_role_permissions` RENAME TO `role_permissions`;--> statement-breakpoint
CREATE UNIQUE INDEX `role_permissions_role_id_permission_id_unique` ON `role_permissions` (`role_id`,`permission_id`);
