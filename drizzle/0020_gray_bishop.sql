UPDATE `match_events` SET `type` = 'player-team-change' WHERE `domain` = 'room' AND `type` IN ('player-joined', 'player-team-changed');--> statement-breakpoint
UPDATE `match_events` SET `type` = 'player-leave' WHERE `domain` = 'room' AND `type` = 'player-left';--> statement-breakpoint
CREATE TABLE `room_instance_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`room_instance_id` integer NOT NULL,
	`match_id` integer,
	`sequence` integer NOT NULL,
	`domain` text NOT NULL,
	`type` text NOT NULL,
	`scope` text NOT NULL,
	`actor_player_id` integer,
	`subject_player_id` integer,
	`team` text,
	`room_player_id` integer,
	`play_id` text,
	`source_state` text,
	`value` text,
	`occurred_at` text,
	`elapsed_seconds` real,
	`tick` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_instance_id`) REFERENCES `room_instances`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "room_instance_events_value_json_valid" CHECK(json_valid("room_instance_events"."value"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_instance_events_uuid_unique` ON `room_instance_events` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_instance_events_room_sequence_unique` ON `room_instance_events` (`room_instance_id`,`sequence`);
