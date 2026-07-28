ALTER TABLE `matches` ADD `completion_reason` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `room_instance_id` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `last_checkpoint_at` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `last_checkpoint_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `elapsed_seconds` real;--> statement-breakpoint
ALTER TABLE `matches` ADD `last_producer_sequence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `recording_checkpoint_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `recording_checkpoint_object_key` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `recording_checkpoint_sha256` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `recording_checkpoint_size_bytes` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `matches_session_id_unique` ON `matches` (`session_id`);--> statement-breakpoint
CREATE INDEX `matches_room_instance_status_idx` ON `matches` (`room_instance_id`,`status`);--> statement-breakpoint
ALTER TABLE `match_events` ADD `producer_sequence` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `match_events_match_id_producer_sequence_unique` ON `match_events` (`match_id`,`producer_sequence`);