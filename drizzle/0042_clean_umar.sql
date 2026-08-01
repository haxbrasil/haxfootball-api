CREATE TABLE `championship_honor_definition_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`definition_id` integer NOT NULL,
	`actor_account_id` integer NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`definition_id`) REFERENCES `championship_honor_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_honor_definition_audit_events_uuid_unique` ON `championship_honor_definition_audit_events` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_honor_definition_audit_idx` ON `championship_honor_definition_audit_events` (`definition_id`,`id`);--> statement-breakpoint
CREATE TABLE `championship_honor_definition_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`definition_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`recipient_types` text NOT NULL,
	`minimum_recipients` integer DEFAULT 1 NOT NULL,
	`maximum_recipients` integer DEFAULT 1 NOT NULL,
	`aggregate_by_identity` integer DEFAULT false NOT NULL,
	`presentation` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`definition_id`) REFERENCES `championship_honor_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_honor_definition_drafts_definition_id_unique` ON `championship_honor_definition_drafts` (`definition_id`);--> statement-breakpoint
CREATE TABLE `championship_honor_definition_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`definition_id` integer NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`recipient_types` text NOT NULL,
	`minimum_recipients` integer NOT NULL,
	`maximum_recipients` integer NOT NULL,
	`aggregate_by_identity` integer NOT NULL,
	`presentation` text NOT NULL,
	`published_by_account_id` integer,
	`published_at` text NOT NULL,
	FOREIGN KEY (`definition_id`) REFERENCES `championship_honor_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_honor_definition_versions_uuid_unique` ON `championship_honor_definition_versions` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_honor_definition_versions_unique` ON `championship_honor_definition_versions` (`definition_id`,`version`);--> statement-breakpoint
CREATE TABLE `championship_honor_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by_account_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_honor_definitions_uuid_unique` ON `championship_honor_definitions` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_honor_definitions_slug_unique` ON `championship_honor_definitions` (`slug`);--> statement-breakpoint
CREATE INDEX `championship_honor_definitions_kind_state_idx` ON `championship_honor_definitions` (`kind`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_honor_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`honor_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`team_id` integer,
	`team_identity_id_snapshot` integer,
	`participant_id` integer,
	`account_id` integer,
	`historical_player_identity_id` integer,
	`display_label_snapshot` text NOT NULL,
	`rank` integer,
	`note` text,
	`awarded_by_account_id` integer,
	`awarded_at` text NOT NULL,
	`revoked_by_account_id` integer,
	`revoked_at` text,
	`revocation_reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`honor_id`) REFERENCES `championship_honors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_identity_id_snapshot`) REFERENCES `championship_team_identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `championship_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`historical_player_identity_id`) REFERENCES `championship_historical_player_identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`awarded_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revoked_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_honor_grants_uuid_unique` ON `championship_honor_grants` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_honor_grants_honor_idx` ON `championship_honor_grants` (`honor_id`,`revoked_at`,`id`);--> statement-breakpoint
CREATE INDEX `championship_honor_grants_identity_idx` ON `championship_honor_grants` (`team_identity_id_snapshot`,`revoked_at`,`id`);--> statement-breakpoint
CREATE INDEX `championship_honor_grants_account_idx` ON `championship_honor_grants` (`account_id`,`revoked_at`,`id`);--> statement-breakpoint
CREATE TABLE `championship_honors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`definition_version_id` integer NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`name_override` text,
	`description_override` text,
	`decision_policy` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`announced_at` text,
	`awarded_at` text,
	`voided_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`definition_version_id`) REFERENCES `championship_honor_definition_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_honors_uuid_unique` ON `championship_honors` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_honors_state_order_idx` ON `championship_honors` (`championship_id`,`state`,`display_order`,`id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `permissions` (`uuid`, `key`, `title`, `created_at`, `updated_at`) VALUES
  ('436acaba-6aa7-4c68-9872-aeaa5fd4ec10', 'honor-definition:admin', 'Administrar catálogo de títulos e prêmios', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
