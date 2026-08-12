-- Product catalog search (searchProductCatalog) resolves each catalog product's
-- aliases through a correlated subquery on product_aliases.product_id. Indexing
-- product_id lets SQLite jump straight to the matching alias rows instead of
-- scanning the whole product_aliases table for every catalog row, which could
-- read ~12M rows per search. Idempotent by convention.
CREATE INDEX IF NOT EXISTS idx_product_aliases_product
  ON product_aliases(product_id);
