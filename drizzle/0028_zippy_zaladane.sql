CREATE TABLE `championship_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	`correlation_uuid` text NOT NULL,
	`command_uuid` text,
	`actor_kind` text NOT NULL,
	`actor_account_id` integer,
	`action` text NOT NULL,
	`source` text NOT NULL,
	`target_type` text NOT NULL,
	`target_uuid` text,
	`before` text,
	`after` text,
	`reason` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_audit_events_uuid_unique` ON `championship_audit_events` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_audit_events_sequence_unique` ON `championship_audit_events` (`championship_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_audit_events_command_unique` ON `championship_audit_events` (`championship_id`,`command_uuid`);--> statement-breakpoint
CREATE INDEX `championship_audit_events_created_id_idx` ON `championship_audit_events` (`championship_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `championship_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`command_uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`actor_account_id` integer,
	`expected_revision` integer NOT NULL,
	`resulting_revision` integer NOT NULL,
	`action` text NOT NULL,
	`response` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_commands_command_uuid_unique` ON `championship_commands` (`command_uuid`);--> statement-breakpoint
CREATE INDEX `championship_commands_championship_id_idx` ON `championship_commands` (`championship_id`,`id`);--> statement-breakpoint
CREATE TABLE `championship_competition_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cadence` text,
	`default_rules_schema_version` integer DEFAULT 1 NOT NULL,
	`default_rules` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_competition_types_uuid_unique` ON `championship_competition_types` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_competition_types_slug_unique` ON `championship_competition_types` (`slug`);--> statement-breakpoint
CREATE INDEX `championship_competition_types_state_id_idx` ON `championship_competition_types` (`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_outbox_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`audit_event_id` integer NOT NULL,
	`topic` text NOT NULL,
	`payload` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`delivered_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `championship_audit_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_outbox_events_uuid_unique` ON `championship_outbox_events` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_outbox_events_delivery_idx` ON `championship_outbox_events` (`state`,`available_at`,`id`);--> statement-breakpoint
CREATE TABLE `championship_permission_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`championship_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`permission` text NOT NULL,
	`granted_by_account_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_permission_grants_unique` ON `championship_permission_grants` (`championship_id`,`account_id`,`permission`);--> statement-breakpoint
CREATE INDEX `championship_permission_grants_account_idx` ON `championship_permission_grants` (`account_id`,`championship_id`);--> statement-breakpoint
CREATE TABLE `championship_room_programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`championship_id` integer NOT NULL,
	`room_program_id` integer NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`display_policy` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_program_id`) REFERENCES `room_programs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_room_programs_pair_unique` ON `championship_room_programs` (`championship_id`,`room_program_id`);--> statement-breakpoint
CREATE INDEX `championship_room_programs_state_idx` ON `championship_room_programs` (`championship_id`,`state`);--> statement-breakpoint
CREATE TABLE `championship_rule_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`version` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`rules` text NOT NULL,
	`actor_account_id` integer,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_rule_versions_uuid_unique` ON `championship_rule_versions` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_rule_versions_championship_version_unique` ON `championship_rule_versions` (`championship_id`,`version`);--> statement-breakpoint
CREATE TABLE `championships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`slug` text NOT NULL,
	`competition_type_id` integer NOT NULL,
	`name` text NOT NULL,
	`edition_label` text,
	`description` text,
	`lifecycle` text DEFAULT 'setup' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`registration_state` text DEFAULT 'not-open' NOT NULL,
	`price_state` text DEFAULT 'disabled' NOT NULL,
	`rules_schema_version` integer DEFAULT 1 NOT NULL,
	`rules` text NOT NULL,
	`historical` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`change_sequence` integer DEFAULT 0 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`published_at` text,
	`completed_at` text,
	`archived_at` text,
	`canceled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`competition_type_id`) REFERENCES `championship_competition_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championships_uuid_unique` ON `championships` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championships_slug_unique` ON `championships` (`slug`);--> statement-breakpoint
CREATE INDEX `championships_visibility_lifecycle_id_idx` ON `championships` (`visibility`,`lifecycle`,`id`);--> statement-breakpoint
CREATE INDEX `championships_type_id_idx` ON `championships` (`competition_type_id`,`id`);--> statement-breakpoint
CREATE TABLE `championship_historical_player_identities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`display_name` text NOT NULL,
	`aliases` text,
	`notes` text,
	`linked_account_id` integer,
	`linked_at` text,
	`linked_by_account_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`linked_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_historical_player_identities_uuid_unique` ON `championship_historical_player_identities` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_historical_players_account_idx` ON `championship_historical_player_identities` (`linked_account_id`,`id`);--> statement-breakpoint
CREATE TABLE `championship_participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`account_id` integer,
	`player_id` integer,
	`historical_player_identity_id` integer,
	`display_name_snapshot` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`origin` text NOT NULL,
	`registered_at` text,
	`registration_closed_at` text,
	`withdrawn_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`historical_player_identity_id`) REFERENCES `championship_historical_player_identities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "championship_participants_identity_check" CHECK((("championship_participants"."account_id" is not null) + ("championship_participants"."historical_player_identity_id" is not null)) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_participants_uuid_unique` ON `championship_participants` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_participants_account_unique` ON `championship_participants` (`championship_id`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_participants_historical_unique` ON `championship_participants` (`championship_id`,`historical_player_identity_id`);--> statement-breakpoint
CREATE INDEX `championship_participants_status_id_idx` ON `championship_participants` (`championship_id`,`status`,`id`);--> statement-breakpoint
CREATE TABLE `championship_team_identities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`abbreviation` text,
	`colors` text,
	`branding` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_team_identities_uuid_unique` ON `championship_team_identities` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_team_identities_slug_unique` ON `championship_team_identities` (`slug`);--> statement-breakpoint
CREATE INDEX `championship_team_identities_archived_id_idx` ON `championship_team_identities` (`archived_at`,`id`);--> statement-breakpoint
CREATE TABLE `championship_team_memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`participant_id` integer NOT NULL,
	`role` text NOT NULL,
	`acquisition_source` text NOT NULL,
	`acquisition_reference_uuid` text,
	`price_units_snapshot` integer,
	`effective_from_revision` integer NOT NULL,
	`effective_to_revision` integer,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `championship_participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_team_memberships_uuid_unique` ON `championship_team_memberships` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_memberships_participant_active_idx` ON `championship_team_memberships` (`championship_id`,`participant_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `championship_memberships_team_active_idx` ON `championship_team_memberships` (`team_id`,`ended_at`,`role`);--> statement-breakpoint
CREATE TABLE `championship_teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`team_identity_id` integer,
	`name` text NOT NULL,
	`abbreviation` text,
	`colors` text,
	`branding_snapshot` text,
	`seed` integer,
	`display_order` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_identity_id`) REFERENCES `championship_team_identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_teams_uuid_unique` ON `championship_teams` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_teams_name_unique` ON `championship_teams` (`championship_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_teams_abbreviation_unique` ON `championship_teams` (`championship_id`,`abbreviation`);--> statement-breakpoint
CREATE INDEX `championship_teams_order_id_idx` ON `championship_teams` (`championship_id`,`display_order`,`id`);--> statement-breakpoint
CREATE TABLE `championship_cap_exceptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`cap_units_snapshot` integer NOT NULL,
	`usage_units_snapshot` integer NOT NULL,
	`roster_revision_snapshot` integer NOT NULL,
	`approved_by_account_id` integer NOT NULL,
	`reason` text NOT NULL,
	`approved_at` text NOT NULL,
	`expires_at_revision` integer NOT NULL,
	`expired_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_cap_exceptions_uuid_unique` ON `championship_cap_exceptions` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_cap_exceptions_team_state_idx` ON `championship_cap_exceptions` (`team_id`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_participant_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`championship_id` integer NOT NULL,
	`participant_id` integer NOT NULL,
	`price_units` integer NOT NULL,
	`frozen_at` text,
	`frozen_by_account_id` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `championship_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`frozen_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_participant_prices_unique` ON `championship_participant_prices` (`championship_id`,`participant_id`);--> statement-breakpoint
CREATE INDEX `championship_participant_prices_value_idx` ON `championship_participant_prices` (`championship_id`,`price_units`,`id`);--> statement-breakpoint
CREATE TABLE `championship_salary_ledger_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`participant_id` integer,
	`membership_uuid` text,
	`amount_units` integer NOT NULL,
	`kind` text NOT NULL,
	`source_uuid` text,
	`roster_revision` integer NOT NULL,
	`actor_account_id` integer,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `championship_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_salary_ledger_entries_uuid_unique` ON `championship_salary_ledger_entries` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_salary_ledger_team_id_idx` ON `championship_salary_ledger_entries` (`team_id`,`id`);--> statement-breakpoint
CREATE INDEX `championship_salary_ledger_participant_id_idx` ON `championship_salary_ledger_entries` (`championship_id`,`participant_id`,`id`);--> statement-breakpoint
CREATE TABLE `championship_draft_order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `championship_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_draft_order_position_unique` ON `championship_draft_order` (`draft_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_draft_order_team_unique` ON `championship_draft_order` (`draft_id`,`team_id`);--> statement-breakpoint
CREATE TABLE `championship_draft_turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`draft_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	`round` integer NOT NULL,
	`position` integer NOT NULL,
	`team_id` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`selected_participant_id` integer,
	`price_units_snapshot` integer,
	`opened_at` text,
	`deadline_at` text,
	`overdue_at` text,
	`filled_at` text,
	`selected_by_account_id` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `championship_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_participant_id`) REFERENCES `championship_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_draft_turns_uuid_unique` ON `championship_draft_turns` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_draft_turns_sequence_unique` ON `championship_draft_turns` (`draft_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_draft_turns_participant_unique` ON `championship_draft_turns` (`draft_id`,`selected_participant_id`);--> statement-breakpoint
CREATE INDEX `championship_draft_turns_state_sequence_idx` ON `championship_draft_turns` (`draft_id`,`state`,`sequence`);--> statement-breakpoint
CREATE TABLE `championship_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`state` text DEFAULT 'setup' NOT NULL,
	`rounds` integer NOT NULL,
	`countdown_seconds` integer NOT NULL,
	`next_turn_sequence` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`completed_at` text,
	`canceled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_drafts_uuid_unique` ON `championship_drafts` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_drafts_championship_unique` ON `championship_drafts` (`championship_id`);--> statement-breakpoint
CREATE TABLE `championship_trade_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trade_id` integer NOT NULL,
	`participant_id` integer NOT NULL,
	`from_team_id` integer NOT NULL,
	`to_team_id` integer NOT NULL,
	`frozen_price_units` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trade_id`) REFERENCES `championship_trades`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `championship_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_trade_items_participant_unique` ON `championship_trade_items` (`trade_id`,`participant_id`);--> statement-breakpoint
CREATE INDEX `championship_trade_items_from_team_idx` ON `championship_trade_items` (`trade_id`,`from_team_id`);--> statement-breakpoint
CREATE TABLE `championship_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`proposing_team_id` integer NOT NULL,
	`receiving_team_id` integer NOT NULL,
	`state` text DEFAULT 'proposed' NOT NULL,
	`proposer_account_id` integer NOT NULL,
	`decided_by_account_id` integer,
	`proposing_value_units` integer NOT NULL,
	`receiving_value_units` integer NOT NULL,
	`maximum_difference_units_snapshot` integer NOT NULL,
	`proposed_at` text NOT NULL,
	`deadline_at` text,
	`decided_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposing_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receiving_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposer_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "championship_trades_distinct_teams_check" CHECK("championship_trades"."proposing_team_id" <> "championship_trades"."receiving_team_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_trades_uuid_unique` ON `championship_trades` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_trades_state_id_idx` ON `championship_trades` (`championship_id`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_classification_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`stage_id` integer NOT NULL,
	`position` integer NOT NULL,
	`criterion` text NOT NULL,
	`direction` text DEFAULT 'desc' NOT NULL,
	`config` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `championship_stages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_classification_rules_uuid_unique` ON `championship_classification_rules` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_classification_rules_position_unique` ON `championship_classification_rules` (`stage_id`,`position`);--> statement-breakpoint
CREATE TABLE `championship_classification_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`stage_id` integer NOT NULL,
	`group_id` integer,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`input` text NOT NULL,
	`result` text NOT NULL,
	`created_by_account_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `championship_stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `championship_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_classification_runs_uuid_unique` ON `championship_classification_runs` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_classification_runs_stage_id_idx` ON `championship_classification_runs` (`stage_id`,`id`);--> statement-breakpoint
CREATE TABLE `championship_competition_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`stage_id` integer,
	`name` text NOT NULL,
	`sequence` integer NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`scheduling_authority` text,
	`late_play_policy` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_id`) REFERENCES `championship_stages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_competition_rounds_uuid_unique` ON `championship_competition_rounds` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_competition_rounds_sequence_unique` ON `championship_competition_rounds` (`championship_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `championship_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`stage_id` integer NOT NULL,
	`name` text NOT NULL,
	`display_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `championship_stages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_groups_uuid_unique` ON `championship_groups` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_groups_order_unique` ON `championship_groups` (`stage_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `championship_late_play_authorizations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`championship_match_id` integer NOT NULL,
	`authorized_by_account_id` integer NOT NULL,
	`reason` text NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_match_id`) REFERENCES `championship_matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authorized_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `championship_late_authorizations_match_idx` ON `championship_late_play_authorizations` (`championship_match_id`,`id`);--> statement-breakpoint
CREATE TABLE `championship_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`stage_id` integer NOT NULL,
	`group_id` integer,
	`label` text NOT NULL,
	`display_order` integer NOT NULL,
	`side_a_spot_id` integer NOT NULL,
	`side_b_spot_id` integer NOT NULL,
	`side_a_team_id` integer,
	`side_b_team_id` integer,
	`competition_round_id` integer,
	`scheduled_at` text,
	`schedule_status` text DEFAULT 'unscheduled' NOT NULL,
	`room_program_id` integer,
	`room_program_version_id` integer,
	`match_rules_override` text,
	`bracket` text DEFAULT 'none' NOT NULL,
	`bracket_round` integer,
	`bracket_position` integer,
	`evidence_revision` integer DEFAULT 0 NOT NULL,
	`result_revision` integer DEFAULT 0 NOT NULL,
	`schedule_revision` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_id`) REFERENCES `championship_stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `championship_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`side_a_spot_id`) REFERENCES `championship_spots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`side_b_spot_id`) REFERENCES `championship_spots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`side_a_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`side_b_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`competition_round_id`) REFERENCES `championship_competition_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_program_id`) REFERENCES `room_programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_program_version_id`) REFERENCES `room_program_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_matches_uuid_unique` ON `championship_matches` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_matches_stage_order_unique` ON `championship_matches` (`stage_id`,`display_order`);--> statement-breakpoint
CREATE INDEX `championship_matches_round_schedule_idx` ON `championship_matches` (`competition_round_id`,`scheduled_at`,`id`);--> statement-breakpoint
CREATE INDEX `championship_matches_stage_bracket_idx` ON `championship_matches` (`stage_id`,`bracket`,`bracket_round`,`bracket_position`);--> statement-breakpoint
CREATE TABLE `championship_progression_routes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`source_kind` text NOT NULL,
	`source_match_id` integer,
	`source_group_id` integer,
	`source_outcome` text,
	`source_rank` integer,
	`destination_spot_id` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_match_id`) REFERENCES `championship_matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_group_id`) REFERENCES `championship_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_spot_id`) REFERENCES `championship_spots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_progression_routes_uuid_unique` ON `championship_progression_routes` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_progression_routes_source_unique` ON `championship_progression_routes` (`source_kind`,`source_match_id`,`source_group_id`,`source_outcome`,`source_rank`,`destination_spot_id`);--> statement-breakpoint
CREATE INDEX `championship_progression_routes_destination_idx` ON `championship_progression_routes` (`destination_spot_id`,`state`);--> statement-breakpoint
CREATE TABLE `championship_schedule_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_match_id` integer NOT NULL,
	`parent_proposal_id` integer,
	`proposing_team_id` integer,
	`proposing_account_id` integer NOT NULL,
	`mode` text NOT NULL,
	`exact_time` text,
	`available_from` text,
	`available_to` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`decided_by_account_id` integer,
	`decided_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_match_id`) REFERENCES `championship_matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposing_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposing_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_schedule_proposals_uuid_unique` ON `championship_schedule_proposals` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_schedule_proposals_match_state_idx` ON `championship_schedule_proposals` (`championship_match_id`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_spots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`stage_id` integer NOT NULL,
	`group_id` integer,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`display_order` integer NOT NULL,
	`current_team_id` integer,
	`x` integer,
	`y` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_id`) REFERENCES `championship_stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `championship_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_spots_uuid_unique` ON `championship_spots` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_spots_stage_key_unique` ON `championship_spots` (`stage_id`,`key`);--> statement-breakpoint
CREATE INDEX `championship_spots_group_order_idx` ON `championship_spots` (`group_id`,`display_order`,`id`);--> statement-breakpoint
CREATE INDEX `championship_spots_team_idx` ON `championship_spots` (`championship_id`,`current_team_id`);--> statement-breakpoint
CREATE TABLE `championship_stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`name` text NOT NULL,
	`display_order` integer NOT NULL,
	`engine` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`config_schema_version` integer DEFAULT 1 NOT NULL,
	`config` text NOT NULL,
	`default_championship_room_program_id` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_championship_room_program_id`) REFERENCES `championship_room_programs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_stages_uuid_unique` ON `championship_stages` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_stages_order_unique` ON `championship_stages` (`championship_id`,`display_order`);--> statement-breakpoint
CREATE INDEX `championship_stages_state_idx` ON `championship_stages` (`championship_id`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_match_appearances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`result_revision_id` integer NOT NULL,
	`source_player_id` integer NOT NULL,
	`source_account_id` integer,
	`observed_side` text NOT NULL,
	`playing_time_seconds` real NOT NULL,
	`registered` integer NOT NULL,
	`on_roster` integer NOT NULL,
	`display_name_snapshot` text NOT NULL,
	`findings` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`result_revision_id`) REFERENCES `championship_match_result_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_match_appearances_player_unique` ON `championship_match_appearances` (`result_revision_id`,`source_player_id`);--> statement-breakpoint
CREATE TABLE `championship_match_attributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`result_revision_id` integer NOT NULL,
	`source_player_id` integer NOT NULL,
	`mode` text DEFAULT 'default' NOT NULL,
	`target_participant_id` integer,
	`actor_account_id` integer NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`result_revision_id`) REFERENCES `championship_match_result_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_participant_id`) REFERENCES `championship_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "championship_match_attributions_target_check" CHECK(("championship_match_attributions"."mode" = 'redirect' and "championship_match_attributions"."target_participant_id" is not null) or ("championship_match_attributions"."mode" <> 'redirect' and "championship_match_attributions"."target_participant_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_match_attributions_player_unique` ON `championship_match_attributions` (`result_revision_id`,`source_player_id`);--> statement-breakpoint
CREATE TABLE `championship_match_evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_match_id` integer NOT NULL,
	`physical_match_id` integer,
	`composed_match_id` integer,
	`logical_public_id_snapshot` text NOT NULL,
	`orientation` text NOT NULL,
	`quality` text NOT NULL,
	`attached_by_account_id` integer NOT NULL,
	`note` text,
	`attached_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_match_id`) REFERENCES `championship_matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`physical_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`composed_match_id`) REFERENCES `composed_matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attached_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "championship_match_evidence_source_check" CHECK((("championship_match_evidence"."physical_match_id" is not null) + ("championship_match_evidence"."composed_match_id" is not null)) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_match_evidence_uuid_unique` ON `championship_match_evidence` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_match_evidence_championship_match_id_unique` ON `championship_match_evidence` (`championship_match_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_match_evidence_physical_unique` ON `championship_match_evidence` (`physical_match_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_match_evidence_composed_unique` ON `championship_match_evidence` (`composed_match_id`);--> statement-breakpoint
CREATE TABLE `championship_match_evidence_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evidence_id` integer NOT NULL,
	`physical_match_id` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`orientation` text NOT NULL,
	`side_a_score` integer NOT NULL,
	`side_b_score` integer NOT NULL,
	`completion_reason` text,
	`elapsed_seconds` real,
	`last_checkpoint_at` text,
	`recording_state` text NOT NULL,
	`room_program_id` integer,
	`room_program_version_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`evidence_id`) REFERENCES `championship_match_evidence`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`physical_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_program_id`) REFERENCES `room_programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_program_version_id`) REFERENCES `room_program_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_evidence_rounds_physical_unique` ON `championship_match_evidence_rounds` (`physical_match_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_evidence_rounds_position_unique` ON `championship_match_evidence_rounds` (`evidence_id`,`position`);--> statement-breakpoint
CREATE TABLE `championship_match_result_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`championship_match_id` integer NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`side_a_team_id` integer,
	`side_b_team_id` integer,
	`method` text NOT NULL,
	`side_a_played_score` integer NOT NULL,
	`side_b_played_score` integer NOT NULL,
	`side_a_administrative_score` integer DEFAULT 0 NOT NULL,
	`side_b_administrative_score` integer DEFAULT 0 NOT NULL,
	`side_a_official_score` integer NOT NULL,
	`side_b_official_score` integer NOT NULL,
	`side_a_outcome` text NOT NULL,
	`side_b_outcome` text NOT NULL,
	`evidence_derived` integer DEFAULT false NOT NULL,
	`note` text,
	`settled_by_account_id` integer,
	`settled_at` text NOT NULL,
	`superseded_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`championship_match_id`) REFERENCES `championship_matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`side_a_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`side_b_team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`settled_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "championship_result_official_score_a_check" CHECK("championship_match_result_revisions"."side_a_official_score" = "championship_match_result_revisions"."side_a_played_score" + "championship_match_result_revisions"."side_a_administrative_score"),
	CONSTRAINT "championship_result_official_score_b_check" CHECK("championship_match_result_revisions"."side_b_official_score" = "championship_match_result_revisions"."side_b_played_score" + "championship_match_result_revisions"."side_b_administrative_score")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_match_result_revisions_uuid_unique` ON `championship_match_result_revisions` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_result_revisions_unique` ON `championship_match_result_revisions` (`championship_match_id`,`revision`);--> statement-breakpoint
CREATE INDEX `championship_result_revisions_current_idx` ON `championship_match_result_revisions` (`championship_id`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_metric_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`canonical_metric_key` text NOT NULL,
	`source_event_schema_version_id` integer NOT NULL,
	`source_metric_key` text NOT NULL,
	`display_label` text NOT NULL,
	`value_kind` text NOT NULL,
	`aggregation` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`actor_account_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_event_schema_version_id`) REFERENCES `event_schema_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_metric_mappings_uuid_unique` ON `championship_metric_mappings` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_metric_mappings_source_unique` ON `championship_metric_mappings` (`championship_id`,`source_event_schema_version_id`,`source_metric_key`);--> statement-breakpoint
CREATE INDEX `championship_metric_mappings_canonical_idx` ON `championship_metric_mappings` (`championship_id`,`canonical_metric_key`,`id`);--> statement-breakpoint
CREATE TABLE `championship_statistic_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`championship_id` integer NOT NULL,
	`result_revision_id` integer NOT NULL,
	`participant_id` integer,
	`team_id` integer,
	`metric_key` text NOT NULL,
	`numeric_value` real NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`result_revision_id`) REFERENCES `championship_match_result_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `championship_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `championship_statistics_participant_metric_idx` ON `championship_statistic_entries` (`championship_id`,`participant_id`,`metric_key`,`id`);--> statement-breakpoint
CREATE INDEX `championship_statistics_team_metric_idx` ON `championship_statistic_entries` (`championship_id`,`team_id`,`metric_key`,`id`);--> statement-breakpoint
CREATE TABLE `championship_awards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`kind` text NOT NULL,
	`rank` integer,
	`target_type` text NOT NULL,
	`team_id` integer,
	`team_identity_id_snapshot` integer,
	`participant_id` integer,
	`account_id` integer,
	`historical_player_identity_id` integer,
	`display_label` text NOT NULL,
	`note` text,
	`awarded_by_account_id` integer,
	`awarded_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_identity_id_snapshot`) REFERENCES `championship_team_identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `championship_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`historical_player_identity_id`) REFERENCES `championship_historical_player_identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`awarded_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_awards_uuid_unique` ON `championship_awards` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_awards_kind_idx` ON `championship_awards` (`championship_id`,`kind`,`id`);--> statement-breakpoint
CREATE INDEX `championship_awards_account_idx` ON `championship_awards` (`account_id`,`kind`,`id`);--> statement-breakpoint
CREATE INDEX `championship_awards_identity_idx` ON `championship_awards` (`team_identity_id_snapshot`,`kind`,`id`);--> statement-breakpoint
CREATE TABLE `championship_historical_import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer,
	`format` text NOT NULL,
	`source_name` text NOT NULL,
	`source_sha256` text NOT NULL,
	`mapping` text NOT NULL,
	`state` text DEFAULT 'previewed' NOT NULL,
	`row_count` integer NOT NULL,
	`applied_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`initiated_by_account_id` integer NOT NULL,
	`applied_at` text,
	`rolled_back_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiated_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_historical_import_batches_uuid_unique` ON `championship_historical_import_batches` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_import_batches_source_unique` ON `championship_historical_import_batches` (`source_sha256`,`championship_id`);--> statement-breakpoint
CREATE INDEX `championship_import_batches_state_idx` ON `championship_historical_import_batches` (`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_historical_import_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`row_number` integer NOT NULL,
	`source_key` text,
	`raw` text NOT NULL,
	`normalized` text,
	`state` text NOT NULL,
	`entity_type` text,
	`entity_uuid` text,
	`before` text,
	`after` text,
	`messages` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `championship_historical_import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_import_rows_number_unique` ON `championship_historical_import_rows` (`batch_id`,`row_number`);--> statement-breakpoint
CREATE INDEX `championship_import_rows_state_idx` ON `championship_historical_import_rows` (`batch_id`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_historical_unknown_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_row_id` integer,
	`championship_id` integer,
	`entity_type` text NOT NULL,
	`entity_uuid` text,
	`field` text NOT NULL,
	`raw_value` text,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`batch_row_id`) REFERENCES `championship_historical_import_rows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `championship_unknown_values_entity_idx` ON `championship_historical_unknown_values` (`entity_type`,`entity_uuid`,`id`);--> statement-breakpoint
CREATE TABLE `championship_placements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`rank` integer NOT NULL,
	`team_identity_id_snapshot` integer,
	`team_name_snapshot` text NOT NULL,
	`source` text NOT NULL,
	`awarded_by_account_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `championship_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_identity_id_snapshot`) REFERENCES `championship_team_identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`awarded_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_placements_uuid_unique` ON `championship_placements` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_placements_rank_unique` ON `championship_placements` (`championship_id`,`rank`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_placements_team_unique` ON `championship_placements` (`championship_id`,`team_id`);--> statement-breakpoint
CREATE INDEX `championship_placements_identity_idx` ON `championship_placements` (`team_identity_id_snapshot`,`rank`,`id`);--> statement-breakpoint
CREATE TABLE `championship_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer,
	`scope` text NOT NULL,
	`metric_key` text NOT NULL,
	`target_type` text NOT NULL,
	`target_uuid` text NOT NULL,
	`numeric_value` real,
	`text_value` text,
	`source_result_revision_uuid` text,
	`state` text DEFAULT 'current' NOT NULL,
	`computed_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_records_uuid_unique` ON `championship_records` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_records_metric_state_idx` ON `championship_records` (`scope`,`metric_key`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `championship_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`context_type` text NOT NULL,
	`context_uuid` text,
	`title` text NOT NULL,
	`description` text,
	`assignee_account_id` integer NOT NULL,
	`assigned_by_account_id` integer NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`due_at` text,
	`completed_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_assignments_uuid_unique` ON `championship_assignments` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_assignments_assignee_state_idx` ON `championship_assignments` (`assignee_account_id`,`state`,`id`);--> statement-breakpoint
CREATE INDEX `championship_assignments_context_idx` ON `championship_assignments` (`championship_id`,`context_type`,`context_uuid`,`id`);--> statement-breakpoint
CREATE TABLE `championship_comment_mentions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comment_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `championship_comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_comment_mentions_unique` ON `championship_comment_mentions` (`comment_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `championship_comment_mentions_account_idx` ON `championship_comment_mentions` (`account_id`,`id`);--> statement-breakpoint
CREATE TABLE `championship_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`thread_id` integer NOT NULL,
	`author_account_id` integer NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`edited_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `championship_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_comments_uuid_unique` ON `championship_comments` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_comments_thread_id_idx` ON `championship_comments` (`thread_id`,`id`);--> statement-breakpoint
CREATE TABLE `championship_inbox_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`account_id` integer NOT NULL,
	`championship_id` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`context_type` text,
	`context_uuid` text,
	`audit_event_id` integer,
	`dedupe_key` text,
	`read_at` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `championship_audit_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_inbox_items_uuid_unique` ON `championship_inbox_items` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_inbox_dedupe_unique` ON `championship_inbox_items` (`account_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `championship_inbox_account_unread_idx` ON `championship_inbox_items` (`account_id`,`read_at`,`id`);--> statement-breakpoint
CREATE TABLE `championship_presence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`championship_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`session_uuid` text NOT NULL,
	`context_type` text,
	`context_uuid` text,
	`display` text,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_presence_session_unique` ON `championship_presence` (`championship_id`,`account_id`,`session_uuid`);--> statement-breakpoint
CREATE INDEX `championship_presence_expiry_idx` ON `championship_presence` (`championship_id`,`expires_at`,`id`);--> statement-breakpoint
CREATE TABLE `championship_saved_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`surface` text NOT NULL,
	`name` text NOT NULL,
	`state` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_saved_views_uuid_unique` ON `championship_saved_views` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `championship_saved_views_name_unique` ON `championship_saved_views` (`championship_id`,`account_id`,`surface`,`name`);--> statement-breakpoint
CREATE TABLE `championship_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`championship_id` integer NOT NULL,
	`context_type` text NOT NULL,
	`context_uuid` text,
	`title` text,
	`state` text DEFAULT 'open' NOT NULL,
	`created_by_account_id` integer NOT NULL,
	`resolved_by_account_id` integer,
	`resolved_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`championship_id`) REFERENCES `championships`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `championship_threads_uuid_unique` ON `championship_threads` (`uuid`);--> statement-breakpoint
CREATE INDEX `championship_threads_context_state_idx` ON `championship_threads` (`championship_id`,`context_type`,`context_uuid`,`state`,`id`);--> statement-breakpoint
CREATE TABLE `logical_match_evidence_claim_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`claim_id` integer NOT NULL,
	`physical_match_id` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `logical_match_evidence_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`physical_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `logical_match_evidence_rounds_physical_unique` ON `logical_match_evidence_claim_rounds` (`physical_match_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `logical_match_evidence_rounds_position_unique` ON `logical_match_evidence_claim_rounds` (`claim_id`,`position`);--> statement-breakpoint
CREATE INDEX `logical_match_evidence_rounds_claim_idx` ON `logical_match_evidence_claim_rounds` (`claim_id`,`id`);--> statement-breakpoint
CREATE TABLE `logical_match_evidence_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`consumer_kind` text NOT NULL,
	`consumer_uuid` text NOT NULL,
	`logical_kind` text NOT NULL,
	`physical_match_id` integer,
	`composed_match_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`physical_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`composed_match_id`) REFERENCES `composed_matches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "logical_match_evidence_claims_source_check" CHECK((("logical_match_evidence_claims"."physical_match_id" is not null) + ("logical_match_evidence_claims"."composed_match_id" is not null)) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `logical_match_evidence_claims_uuid_unique` ON `logical_match_evidence_claims` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `logical_match_evidence_claims_consumer_unique` ON `logical_match_evidence_claims` (`consumer_kind`,`consumer_uuid`);