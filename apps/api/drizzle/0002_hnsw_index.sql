-- The HNSW graph for ~30k 1536-d vectors needs ~250 MB to build in memory;
-- with the 64 MB default the build spills and takes several times longer.
-- Session-local: only affects this migration.
SET maintenance_work_mem = '256MB';
--> statement-breakpoint
CREATE INDEX "products_embedding_hnsw_idx" ON "products" USING hnsw ("embedding" vector_cosine_ops);
