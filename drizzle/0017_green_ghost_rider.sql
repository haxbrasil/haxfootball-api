CREATE TABLE `game_modes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`description` text,
	`visibility` text DEFAULT 'visible' NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_modes_uuid_unique` ON `game_modes` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `game_modes_name_unique` ON `game_modes` (`name`);--> statement-breakpoint
ALTER TABLE `matches` ADD `game_mode_id` integer REFERENCES game_modes(id);
