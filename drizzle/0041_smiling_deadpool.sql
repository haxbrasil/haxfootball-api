ALTER TABLE `visualization_template_drafts` ADD `name` text;--> statement-breakpoint
ALTER TABLE `visualization_template_drafts` ADD `title` text;--> statement-breakpoint
ALTER TABLE `visualization_template_drafts` ADD `description` text;--> statement-breakpoint
ALTER TABLE `visualization_template_drafts` ADD `scope` text;--> statement-breakpoint
UPDATE `visualization_template_drafts`
SET
  `name` = (SELECT `name` FROM `visualization_template_families` WHERE `id` = `family_id`),
  `title` = (SELECT `title` FROM `visualization_template_families` WHERE `id` = `family_id`),
  `description` = (SELECT `description` FROM `visualization_template_families` WHERE `id` = `family_id`),
  `scope` = (SELECT `scope` FROM `visualization_template_families` WHERE `id` = `family_id`);--> statement-breakpoint
ALTER TABLE `visualization_template_versions` ADD `name` text;--> statement-breakpoint
ALTER TABLE `visualization_template_versions` ADD `title` text;--> statement-breakpoint
ALTER TABLE `visualization_template_versions` ADD `description` text;--> statement-breakpoint
ALTER TABLE `visualization_template_versions` ADD `scope` text;--> statement-breakpoint
UPDATE `visualization_template_versions`
SET
  `name` = (SELECT `name` FROM `visualization_template_families` WHERE `id` = `family_id`),
  `title` = (SELECT `title` FROM `visualization_template_families` WHERE `id` = `family_id`),
  `description` = (SELECT `description` FROM `visualization_template_families` WHERE `id` = `family_id`),
  `scope` = (SELECT `scope` FROM `visualization_template_families` WHERE `id` = `family_id`);
