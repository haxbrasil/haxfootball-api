CREATE TABLE `room_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`program_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`proxy_endpoint_id` integer,
	`state` text NOT NULL,
	`room_link` text,
	`launch_config` text NOT NULL,
	`public` integer NOT NULL,
	`pid` integer,
	`process_started_at` text,
	`invocation_id` text,
	`log_path` text,
	`comm_id_hash` text NOT NULL,
	`closed_at` text,
	`exit_code` integer,
	`exit_signal` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `room_programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `room_program_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proxy_endpoint_id`) REFERENCES `room_proxy_endpoints`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_instances_uuid_unique` ON `room_instances` (`uuid`);--> statement-breakpoint
CREATE TABLE `room_program_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`program_id` integer NOT NULL,
	`version` text NOT NULL,
	`artifact` text NOT NULL,
	`node_entrypoint` text NOT NULL,
	`install_strategy` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `room_programs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_program_versions_uuid_unique` ON `room_program_versions` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_program_versions_program_id_version_unique` ON `room_program_versions` (`program_id`,`version`);--> statement-breakpoint
CREATE TABLE `room_programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`description` text,
	`release_source` text NOT NULL,
	`launch_config_fields` text NOT NULL,
	`supports_manual_linking` integer NOT NULL,
	`haxball_token_env_var` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_programs_uuid_unique` ON `room_programs` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_programs_name_unique` ON `room_programs` (`name`);--> statement-breakpoint
CREATE TABLE `room_proxy_endpoints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`key` text NOT NULL,
	`display_name` text NOT NULL,
	`outbound_ip` text NOT NULL,
	`proxy_url` text NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_proxy_endpoints_uuid_unique` ON `room_proxy_endpoints` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_proxy_endpoints_key_unique` ON `room_proxy_endpoints` (`key`);