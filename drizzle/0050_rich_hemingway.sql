CREATE TABLE `render_profile_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` integer NOT NULL,
	`settings` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `render_profile_families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `render_profile_drafts_family_id_unique` ON `render_profile_drafts` (`family_id`);--> statement-breakpoint
CREATE TABLE `render_profile_families` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `render_profile_families_uuid_unique` ON `render_profile_families` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `render_profile_families_name_unique` ON `render_profile_families` (`name`);--> statement-breakpoint
CREATE TABLE `render_profile_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`family_id` integer NOT NULL,
	`version` integer NOT NULL,
	`settings` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `render_profile_families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `render_profile_versions_uuid_unique` ON `render_profile_versions` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `render_profile_versions_family_version_unique` ON `render_profile_versions` (`family_id`,`version`);