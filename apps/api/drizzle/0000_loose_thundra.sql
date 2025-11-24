CREATE TABLE `deals` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`message_id` bigint NOT NULL,
	`chat` varchar(255) NOT NULL,
	`chat_id` varchar(255),
	`ts` timestamp NOT NULL,
	`text` text NOT NULL,
	`links` json NOT NULL DEFAULT ('[]'),
	`price` int,
	`coupons` json,
	`store` varchar(255),
	`description` text,
	`product` varchar(500),
	`media_type` varchar(50),
	`photo_id` varchar(255),
	`local_path` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(255) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`expires_at` datetime NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`document` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password` varchar(255) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_id_unique` UNIQUE(`id`),
	CONSTRAINT `users_document_unique` UNIQUE(`document`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `chat_idx` ON `deals` (`chat`);--> statement-breakpoint
CREATE INDEX `ts_idx` ON `deals` (`ts`);--> statement-breakpoint
CREATE INDEX `photo_id_idx` ON `deals` (`photo_id`);--> statement-breakpoint
CREATE INDEX `chat_message_idx` ON `deals` (`chat`,`message_id`);