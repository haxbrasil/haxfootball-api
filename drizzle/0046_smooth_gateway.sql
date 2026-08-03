CREATE TABLE `media_renditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`clip_id` integer NOT NULL,
	`purpose` text NOT NULL,
	`cache_key` text NOT NULL,
	`profile_version` text NOT NULL,
	`status` text NOT NULL,
	`object_key` text,
	`content_type` text,
	`size_bytes` integer,
	`width` integer,
	`height` integer,
	`duration_ticks` integer,
	`renderer_version` text,
	`error_code` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_renditions_uuid_unique` ON `media_renditions` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_renditions_cache_key_unique` ON `media_renditions` (`cache_key`);--> statement-breakpoint
CREATE INDEX `media_renditions_clip_idx` ON `media_renditions` (`clip_id`,`purpose`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `queue` text DEFAULT 'default' NOT NULL;
