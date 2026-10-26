CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text DEFAULT '' NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`brief` text NOT NULL,
	`meta` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`words` integer DEFAULT 0 NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_project` ON `documents` (`project_id`);--> statement-breakpoint
CREATE INDEX `documents_updated` ON `documents` (`updated_at`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_sha256_unique` ON `media` (`sha256`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`publishing` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`words` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `versions_document` ON `versions` (`document_id`,`created_at`);