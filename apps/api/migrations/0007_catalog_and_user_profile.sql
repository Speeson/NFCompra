ALTER TABLE users ADD COLUMN first_name TEXT NULL;
ALTER TABLE users ADD COLUMN last_name TEXT NULL;
ALTER TABLE users ADD COLUMN birth_date TEXT NULL;
ALTER TABLE users ADD COLUMN username TEXT COLLATE NOCASE NULL;

CREATE UNIQUE INDEX idx_users_username
  ON users(username)
  WHERE username IS NOT NULL;

CREATE TABLE product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  parent_id TEXT NULL,
  icon_key TEXT NOT NULL DEFAULT 'shopping-basket',
  source TEXT NULL,
  source_category_id TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE SET NULL
);

CREATE TABLE product_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category_id TEXT NULL,
  icon_key TEXT NOT NULL DEFAULT 'shopping-basket',
  brand TEXT NULL,
  package_size TEXT NULL,
  source TEXT NULL,
  source_product_id TEXT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_product_catalog_source_product
  ON product_catalog(source, source_product_id)
  WHERE source IS NOT NULL AND source_product_id IS NOT NULL;

CREATE INDEX idx_product_catalog_search
  ON product_catalog(normalized_name);

CREATE INDEX idx_product_catalog_category
  ON product_catalog(category_id);

CREATE TABLE product_aliases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES product_catalog(id) ON DELETE CASCADE
);

CREATE INDEX idx_product_aliases_search
  ON product_aliases(normalized_alias);

ALTER TABLE shopping_items ADD COLUMN catalog_product_id TEXT NULL REFERENCES product_catalog(id) ON DELETE SET NULL;
