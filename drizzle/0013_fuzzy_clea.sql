ALTER TABLE `room_program_versions` RENAME COLUMN "node_entrypoint" TO "entrypoint";--> statement-breakpoint
ALTER TABLE `room_instances` ADD `failed_at` text;--> statement-breakpoint
ALTER TABLE `room_instances` ADD `failure_reason` text;--> statement-breakpoint
ALTER TABLE `room_programs` ADD `integration_mode` text NOT NULL DEFAULT 'external';--> statement-breakpoint
UPDATE `room_programs` SET `integration_mode` = CASE WHEN `supports_manual_linking` THEN 'integrated' ELSE 'external' END;--> statement-breakpoint
ALTER TABLE `room_programs` DROP COLUMN `supports_manual_linking`;
