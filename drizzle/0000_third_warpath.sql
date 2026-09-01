CREATE TABLE `applications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_name` text NOT NULL,
  `contact_person` text NOT NULL,
  `email` text NOT NULL,
  `phone` text NOT NULL,
  `activity_type` text NOT NULL,
  `main_location` text NOT NULL,
  `player_count` text NOT NULL,
  `help_needed` text NOT NULL,
  `description` text NOT NULL,
  `status` text DEFAULT 'submitted' NOT NULL,
  `submitted_at` text NOT NULL,
  `reviewed_at` text
);
--> statement-breakpoint
CREATE TABLE `organizations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `application_id` integer NOT NULL,
  `name` text NOT NULL,
  `primary_contact` text NOT NULL,
  `email` text NOT NULL,
  `phone` text NOT NULL,
  `activity_type` text NOT NULL,
  `main_location` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_application_id_unique` ON `organizations` (`application_id`);
