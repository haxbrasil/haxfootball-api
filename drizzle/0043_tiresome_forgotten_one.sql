DROP INDEX `championship_honor_definitions_slug_unique`;--> statement-breakpoint
DROP INDEX `championship_honor_definitions_kind_state_idx`;--> statement-breakpoint
ALTER TABLE `championship_honor_definitions` ADD `competition_type_id` integer NOT NULL REFERENCES championship_competition_types(id);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_honor_definitions_type_slug_unique` ON `championship_honor_definitions` (`competition_type_id`,`slug`);--> statement-breakpoint
CREATE INDEX `championship_honor_definitions_kind_state_idx` ON `championship_honor_definitions` (`competition_type_id`,`kind`,`state`,`id`);