ALTER TABLE `deals` ADD `product_key` varchar(200);--> statement-breakpoint
ALTER TABLE `deals` ADD `category` varchar(50);--> statement-breakpoint
CREATE INDEX `product_key_idx` ON `deals` (`product_key`);--> statement-breakpoint
CREATE INDEX `category_idx` ON `deals` (`category`);