CREATE TABLE IF NOT EXISTS `programs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer,
  `slug` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `age_min` integer NOT NULL,
  `age_max` integer NOT NULL,
  `coed` integer NOT NULL DEFAULT 1,
  `location` text NOT NULL,
  `day_of_week` text NOT NULL,
  `start_time` text NOT NULL,
  `capacity` integer NOT NULL,
  `active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `program_terms` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `program_id` integer NOT NULL,
  `name` text NOT NULL,
  `start_date` text NOT NULL,
  `end_date` text NOT NULL,
  `break_dates` text NOT NULL,
  `weekly_fee_cents` integer NOT NULL,
  `term_fee_cents` integer NOT NULL,
  `registration_fee_cents` integer NOT NULL DEFAULT 0,
  `active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  UNIQUE(`program_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `registrations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `reference_code` text NOT NULL UNIQUE,
  `organization_id` integer,
  `program_id` integer NOT NULL,
  `term_id` integer NOT NULL,
  `parent_name` text NOT NULL,
  `parent_email` text NOT NULL,
  `parent_phone` text NOT NULL,
  `relationship` text NOT NULL,
  `child_name` text NOT NULL,
  `child_dob` text NOT NULL,
  `gender` text NOT NULL,
  `emergency_contact_name` text NOT NULL,
  `emergency_contact_phone` text NOT NULL,
  `allergies` text NOT NULL DEFAULT '',
  `medical_conditions` text NOT NULL DEFAULT '',
  `medications` text NOT NULL DEFAULT '',
  `special_needs` text NOT NULL DEFAULT '',
  `authorized_pickup` text NOT NULL,
  `additional_notes` text NOT NULL DEFAULT '',
  `photo_consent` text NOT NULL,
  `payment_frequency` text NOT NULL,
  `payment_method` text NOT NULL,
  `amount_due_cents` integer NOT NULL,
  `registration_status` text NOT NULL DEFAULT 'pending',
  `payment_status` text NOT NULL DEFAULT 'pending',
  `consent_version` text NOT NULL,
  `consent_accepted` integer NOT NULL,
  `consent_at` text NOT NULL,
  `signature_name` text NOT NULL,
  `submitted_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `locations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `name` text NOT NULL,
  `address` text NOT NULL,
  `map_label` text,
  `active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_members` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `name` text NOT NULL,
  `role` text NOT NULL,
  `email` text,
  `responsibilities` text NOT NULL DEFAULT '',
  `active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  UNIQUE(`organization_id`,`name`,`role`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `program_id` integer NOT NULL,
  `term_id` integer NOT NULL,
  `session_date` text NOT NULL,
  `start_time` text NOT NULL,
  `location` text NOT NULL,
  `status` text NOT NULL DEFAULT 'scheduled',
  `created_at` text NOT NULL,
  UNIQUE(`program_id`,`term_id`,`session_date`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `payments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `registration_id` integer NOT NULL,
  `amount_cents` integer NOT NULL,
  `method` text NOT NULL,
  `status` text NOT NULL DEFAULT 'received',
  `recorded_by` text,
  `note` text NOT NULL DEFAULT '',
  `received_at` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `registrations_program_term_idx` ON `registrations` (`program_id`,`term_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `registrations_parent_email_idx` ON `registrations` (`parent_email`);
