ALTER TABLE users ADD COLUMN product_entry_mode TEXT NOT NULL DEFAULT 'catalog'
  CHECK(product_entry_mode IN ('catalog', 'quick'));
