CREATE TABLE `composed_match_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`composed_match_id` integer NOT NULL,
	`match_id` integer NOT NULL,
	`kind` text NOT NULL,
	`round_number` integer,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`composed_match_id`) REFERENCES `composed_matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "composed_match_rounds_kind_number_check" CHECK(("composed_match_rounds"."kind" = 'sequential' and "composed_match_rounds"."round_number" is not null and "composed_match_rounds"."round_number" >= 1) or ("composed_match_rounds"."kind" = 'extra-time' and "composed_match_rounds"."round_number" is null)),
	CONSTRAINT "composed_match_rounds_position_check" CHECK("composed_match_rounds"."position" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `composed_match_rounds_match_id_unique` ON `composed_match_rounds` (`match_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `composed_match_rounds_composition_position_unique` ON `composed_match_rounds` (`composed_match_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `composed_match_rounds_composition_number_unique` ON `composed_match_rounds` (`composed_match_id`,`round_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `composed_match_rounds_extra_time_unique` ON `composed_match_rounds` (`composed_match_id`) WHERE "composed_match_rounds"."kind" = 'extra-time';--> statement-breakpoint
CREATE TABLE `composed_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`first_match_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`first_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "composed_matches_public_id_check" CHECK(length("composed_matches"."public_id") = 9 and "composed_matches"."public_id" glob 'c[a-z2-9][a-z2-9][a-z2-9][a-z2-9][a-z2-9][a-z2-9][a-z2-9][a-z2-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `composed_matches_public_id_unique` ON `composed_matches` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `composed_matches_first_match_id_unique` ON `composed_matches` (`first_match_id`);