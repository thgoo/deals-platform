CREATE TABLE `alerts` (
	`id` varchar(36) NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`subscription` json NOT NULL,
	`last_notified_price` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `expires_at_idx` ON `alerts` (`expires_at`);