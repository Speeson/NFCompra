PRAGMA defer_foreign_keys = ON;

CREATE TABLE product_categories_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  parent_id TEXT NULL,
  icon_key TEXT NOT NULL DEFAULT 'shopping-basket',
  source TEXT NULL,
  source_category_id TEXT NULL,
  scope TEXT NOT NULL DEFAULT 'system' CHECK(scope IN ('system', 'household')),
  household_id TEXT NULL,
  created_by TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE SET NULL
);

INSERT INTO product_categories_new (
  id, name, normalized_name, parent_id, icon_key, source, source_category_id, created_at, updated_at
)
SELECT id, name, normalized_name, parent_id, icon_key, source, source_category_id, created_at, updated_at
FROM product_categories;

DROP TABLE product_categories;

ALTER TABLE product_categories_new RENAME TO product_categories;

CREATE UNIQUE INDEX idx_product_categories_scope_name
  ON product_categories(scope, COALESCE(household_id, ''), normalized_name);

CREATE INDEX idx_product_categories_scope_household
  ON product_categories(scope, household_id);

ALTER TABLE product_catalog ADD COLUMN scope TEXT NOT NULL DEFAULT 'system' CHECK(scope IN ('system', 'household'));
ALTER TABLE product_catalog ADD COLUMN household_id TEXT NULL;
ALTER TABLE product_catalog ADD COLUMN created_by TEXT NULL;

CREATE INDEX idx_product_catalog_scope_household
  ON product_catalog(scope, household_id);
