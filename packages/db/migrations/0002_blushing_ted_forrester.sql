CREATE TABLE `interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`at` integer NOT NULL,
	`data` text
);
--> statement-breakpoint
CREATE INDEX `interactions_at` ON `interactions` (`at`);--> statement-breakpoint
CREATE INDEX `interactions_kind` ON `interactions` (`kind`,`at`);