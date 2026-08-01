DROP INDEX `championship_memberships_team_active_idx`;--> statement-breakpoint
ALTER TABLE `championship_team_memberships` ADD `display_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `championship_memberships_team_active_idx` ON `championship_team_memberships` (`team_id`,`ended_at`,`display_order`,`role`);