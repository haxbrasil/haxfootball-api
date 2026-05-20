CREATE TABLE `languages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `code` text NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `languages_code_unique` ON `languages` (`code`);
--> statement-breakpoint
CREATE TABLE `values` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `value` text NOT NULL,
  `language_id` integer NOT NULL,
  `label` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `values_value_language_id_unique` ON `values` (`value`, `language_id`);
--> statement-breakpoint
INSERT INTO `languages` (`code`, `name`, `created_at`, `updated_at`)
VALUES
  ('en', 'English', datetime('now'), datetime('now')),
  ('pt', 'Português', datetime('now'), datetime('now'));
