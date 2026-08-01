CREATE TABLE `game_mode_event_schemas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_mode_id` integer NOT NULL,
	`event_schema_family_id` integer NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_mode_id`) REFERENCES `game_modes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_schema_family_id`) REFERENCES `event_schema_families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_mode_event_schemas_unique` ON `game_mode_event_schemas` (`game_mode_id`,`event_schema_family_id`);--> statement-breakpoint
CREATE INDEX `game_mode_event_schemas_mode_idx` ON `game_mode_event_schemas` (`game_mode_id`,`id`);--> statement-breakpoint
CREATE TABLE `event_schema_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` integer NOT NULL,
	`definition` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `event_schema_families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_schema_drafts_family_id_unique` ON `event_schema_drafts` (`family_id`);--> statement-breakpoint
CREATE TABLE `championship_visualization_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`template_version_id` integer NOT NULL,
	`surface` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`width` text DEFAULT 'half' NOT NULL,
	`height` text DEFAULT 'medium' NOT NULL,
	`title_override` text,
	`overrides` text DEFAULT '{}' NOT NULL,
	`visibility` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_version_id`) REFERENCES `visualization_template_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_visualization_instances_uuid_unique` ON `championship_visualization_instances` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_visualizations_surface_idx` ON `championship_visualization_instances` (`championship_id`,`surface`,`display_order`);--> statement-breakpoint
CREATE TABLE `visualization_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`family_id` integer,
	`championship_id` integer,
	`action` text NOT NULL,
	`actor_account_uuid` text,
	`before` text,
	`after` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `visualization_template_families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visualization_audit_events_uuid_unique` ON `visualization_audit_events` (`uuid`);--> statement-breakpoint
CREATE TABLE `visualization_template_compatibilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` integer NOT NULL,
	`game_mode_id` integer,
	`event_schema_family_id` integer,
	`required_metrics` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `visualization_template_families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_mode_id`) REFERENCES `game_modes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_schema_family_id`) REFERENCES `event_schema_families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `visualization_template_compat_family_idx` ON `visualization_template_compatibilities` (`family_id`,`id`);--> statement-breakpoint
CREATE TABLE `visualization_template_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` integer NOT NULL,
	`specification` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `visualization_template_families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visualization_template_drafts_family_id_unique` ON `visualization_template_drafts` (`family_id`);--> statement-breakpoint
CREATE TABLE `visualization_template_families` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`scope` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`internal_notes` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visualization_template_families_uuid_unique` ON `visualization_template_families` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `visualization_template_families_name_unique` ON `visualization_template_families` (`name`);--> statement-breakpoint
CREATE TABLE `visualization_template_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`family_id` integer NOT NULL,
	`version` integer NOT NULL,
	`specification` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `visualization_template_families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visualization_template_versions_unique` ON `visualization_template_versions` (`family_id`,`version`);--> statement-breakpoint
ALTER TABLE `event_schema_families` ADD `management_mode` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `event_schema_families` ADD `management_source` text;
--> statement-breakpoint
UPDATE `event_schema_families`
SET `management_mode` = 'external', `management_source` = 'HaxFootball room program'
WHERE `name` = 'haxfootball';
