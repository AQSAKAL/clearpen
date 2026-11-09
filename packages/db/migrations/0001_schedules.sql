CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`cadence` text NOT NULL,
	`next_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`rev` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schedules_project` ON `schedules` (`project_id`);--> statement-breakpoint
CREATE INDEX `schedules_next` ON `schedules` (`next_at`);