CREATE INDEX `store_idx` ON `deals` (`store`);
--> statement-breakpoint
CREATE FULLTEXT INDEX `search_idx` ON `deals` (`text`, `product`, `description`, `store`);