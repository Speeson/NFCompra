CREATE TABLE user_product_favorites (
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES product_catalog(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_product_favorites_product
  ON user_product_favorites(product_id);
