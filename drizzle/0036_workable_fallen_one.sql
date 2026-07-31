ALTER TABLE `championship_late_play_authorizations` ADD `uuid` text;--> statement-breakpoint
UPDATE `championship_late_play_authorizations`
SET `uuid` = lower(
  hex(randomblob(4)) || '-' ||
  hex(randomblob(2)) || '-4' ||
  substr(hex(randomblob(2)), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(hex(randomblob(2)), 2) || '-' ||
  hex(randomblob(6))
)
WHERE `uuid` IS NULL;--> statement-breakpoint
ALTER TABLE `championship_late_play_authorizations` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `championship_late_play_authorizations_uuid_unique` ON `championship_late_play_authorizations` (`uuid`);--> statement-breakpoint
ALTER TABLE `championship_schedule_proposals` ADD `revision` integer DEFAULT 0 NOT NULL;
