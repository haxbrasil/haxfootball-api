ALTER TABLE `accounts` ADD `auth` text;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_auth_unique` ON `accounts` (`auth`);--> statement-breakpoint
ALTER TABLE `players` ADD `identity_key` text NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `room_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `room_player_id` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `auth` text;--> statement-breakpoint
ALTER TABLE `players` ADD `conn` text;--> statement-breakpoint
CREATE UNIQUE INDEX `players_identity_key_unique` ON `players` (`identity_key`);
