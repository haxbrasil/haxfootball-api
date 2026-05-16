CREATE TABLE `job_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`key` text NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`interval_seconds` integer NOT NULL,
	`enabled` integer NOT NULL,
	`next_run_at` text NOT NULL,
	`last_enqueued_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_schedules_uuid_unique` ON `job_schedules` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_schedules_key_unique` ON `job_schedules` (`key`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`payload` text,
	`result` text,
	`error` text,
	`attempts` integer NOT NULL,
	`max_attempts` integer NOT NULL,
	`run_after` text NOT NULL,
	`locked_at` text,
	`locked_by` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_uuid_unique` ON `jobs` (`uuid`);