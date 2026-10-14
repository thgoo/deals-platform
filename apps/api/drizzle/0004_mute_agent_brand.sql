CREATE TABLE `product_match_decisions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`deal_id` bigint unsigned NOT NULL,
	`product_id` varchar(36),
	`method` enum('url_anchor','embedding_only','llm_judge','created_new','skipped') NOT NULL,
	`top_candidates` json,
	`similarity_score` decimal(5,4),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_match_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_url_mappings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`source` varchar(50) NOT NULL,
	`external_id` varchar(200) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`confidence` enum('llm_high','llm_medium','manual') NOT NULL DEFAULT 'llm_high',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_url_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `source_external_uk` UNIQUE(`source`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` varchar(36) NOT NULL,
	`canonical_name` varchar(500) NOT NULL,
	`model_key` varchar(200),
	`category` varchar(50),
	`embedding` json NOT NULL,
	`embedding_model_version` varchar(100) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `deals` ADD `product_id` varchar(36);--> statement-breakpoint
ALTER TABLE `product_match_decisions` ADD CONSTRAINT `product_match_decisions_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_match_decisions` ADD CONSTRAINT `product_match_decisions_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_url_mappings` ADD CONSTRAINT `product_url_mappings_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `deal_idx` ON `product_match_decisions` (`deal_id`);--> statement-breakpoint
CREATE INDEX `product_idx` ON `product_match_decisions` (`product_id`);--> statement-breakpoint
CREATE INDEX `method_idx` ON `product_match_decisions` (`method`);--> statement-breakpoint
CREATE INDEX `product_idx` ON `product_url_mappings` (`product_id`);--> statement-breakpoint
CREATE INDEX `model_key_idx` ON `products` (`model_key`);--> statement-breakpoint
CREATE INDEX `category_idx` ON `products` (`category`);--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `product_id_idx` ON `deals` (`product_id`);