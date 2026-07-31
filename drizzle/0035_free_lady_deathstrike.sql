ALTER TABLE `championship_spots` ADD `placement_rank` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `championship_spots_placement_rank_unique` ON `championship_spots` (`championship_id`,`placement_rank`);--> statement-breakpoint
ALTER TABLE `championship_match_evidence` ADD `score_mode` text DEFAULT 'cumulative' NOT NULL;