ALTER TABLE `media_renditions` ADD `source_kind` text DEFAULT 'clip' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_renditions` ADD `source_fingerprint` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_renditions` ADD `checksum_sha256` text;
