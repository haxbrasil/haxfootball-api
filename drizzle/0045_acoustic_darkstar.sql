ALTER TABLE `championship_draft_turns` ADD `recorded_resolution` text;--> statement-breakpoint
ALTER TABLE `championship_draft_turns` ADD `occurred_at` text;--> statement-breakpoint
ALTER TABLE `championship_draft_turns` ADD `recorded_note` text;--> statement-breakpoint
ALTER TABLE `championship_drafts` ADD `mode` text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE `championship_drafts` ADD `occurred_at` text;--> statement-breakpoint
ALTER TABLE `championship_drafts` ADD `recorded_at` text;--> statement-breakpoint
ALTER TABLE `championship_drafts` ADD `recorded_by_account_id` integer REFERENCES accounts(id);--> statement-breakpoint
ALTER TABLE `championship_drafts` ADD `recorded_note` text;