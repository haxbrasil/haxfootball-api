CREATE TABLE `championship_catalog_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`competition_type_id` integer,
	`sequence` integer NOT NULL,
	`command_uuid` text NOT NULL,
	`actor_account_id` integer NOT NULL,
	`action` text NOT NULL,
	`target_uuid` text,
	`before` text,
	`after` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`competition_type_id`) REFERENCES `championship_competition_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_catalog_audit_events_uuid_unique` ON `championship_catalog_audit_events` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_catalog_audit_events_command_uuid_unique` ON `championship_catalog_audit_events` (`command_uuid`);--> statement-breakpoint
CREATE INDEX `championship_catalog_audit_type_sequence_idx` ON `championship_catalog_audit_events` (`competition_type_id`,`sequence`,`id`);--> statement-breakpoint
ALTER TABLE `championship_competition_types` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `permissions` (`uuid`, `key`, `title`, `created_at`, `updated_at`) VALUES
	('00000000-0000-4000-8000-000000000101', 'championship:admin', 'Championship administration', datetime('now'), datetime('now')),
	('00000000-0000-4000-8000-000000000102', 'championship:operate', 'Championship operations', datetime('now'), datetime('now')),
	('00000000-0000-4000-8000-000000000103', 'championship-history:admin', 'Championship history administration', datetime('now'), datetime('now'));
