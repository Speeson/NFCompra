DROP TRIGGER IF EXISTS notifications_item_created;
DROP TRIGGER IF EXISTS notifications_item_updated;
DROP TRIGGER IF EXISTS notifications_item_deleted;

ALTER TABLE shopping_items RENAME TO shopping_items_legacy;

CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NULL,
  category TEXT NULL,
  note TEXT NULL,
  is_checked INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NULL,
  updated_by TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  catalog_product_id TEXT NULL,
  FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (catalog_product_id) REFERENCES product_catalog(id) ON DELETE SET NULL
);

INSERT INTO shopping_items (
  id, list_id, name, normalized_name, quantity, unit, category, note, is_checked,
  position, version, created_by, updated_by, created_at, updated_at, catalog_product_id
)
SELECT
  id, list_id, name, normalized_name, quantity, unit, category, note, is_checked,
  position, version, created_by, updated_by, created_at, updated_at, catalog_product_id
FROM shopping_items_legacy;

DROP TABLE shopping_items_legacy;

CREATE INDEX idx_shopping_items_list_id
  ON shopping_items(list_id);

CREATE INDEX idx_shopping_items_list_checked
  ON shopping_items(list_id, is_checked);

CREATE INDEX idx_shopping_items_list_normalized_name
  ON shopping_items(list_id, normalized_name);

CREATE TRIGGER notifications_item_created AFTER INSERT ON shopping_items BEGIN   UPDATE notifications SET group_key = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')   WHERE group_key IN (SELECT household_members.user_id || ':' || NEW.created_by || ':' || NEW.list_id || ':item_created' FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = NEW.list_id AND household_members.user_id <> NEW.created_by)     AND (read_at IS NOT NULL OR grouped_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));   INSERT INTO notifications (id, user_id, type, title, body, household_id, list_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)   SELECT lower(hex(randomblob(16))), household_members.user_id, 'item_created', 'Producto añadido', 'Se ha añadido un producto a una lista compartida.', shopping_lists.household_id, NEW.list_id, NEW.created_by, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes'), household_members.user_id || ':' || NEW.created_by || ':' || NEW.list_id || ':item_created', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')   FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = NEW.list_id AND household_members.user_id <> NEW.created_by   ON CONFLICT(group_key) WHERE group_key IS NOT NULL DO UPDATE SET title = excluded.title, body = excluded.body, grouped_until = excluded.grouped_until, updated_at = excluded.updated_at WHERE notifications.read_at IS NULL AND notifications.grouped_until >= excluded.created_at; END;
CREATE TRIGGER notifications_item_updated AFTER UPDATE OF name, normalized_name, quantity, unit, category, note, is_checked, position ON shopping_items BEGIN   UPDATE notifications SET group_key = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')   WHERE group_key IN (SELECT household_members.user_id || ':' || NEW.updated_by || ':' || NEW.list_id || ':' || CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'item_checked' ELSE 'item_updated' END FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = NEW.list_id AND household_members.user_id <> NEW.updated_by)     AND (read_at IS NOT NULL OR grouped_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));   INSERT INTO notifications (id, user_id, type, title, body, household_id, list_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)   SELECT lower(hex(randomblob(16))), household_members.user_id, CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'item_checked' ELSE 'item_updated' END , CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'Producto marcado' ELSE 'Producto actualizado' END , CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'Se ha marcado un producto en una lista compartida.' ELSE 'Se ha actualizado un producto en una lista compartida.' END , shopping_lists.household_id, NEW.list_id, NEW.updated_by, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes'), household_members.user_id || ':' || NEW.updated_by || ':' || NEW.list_id || ':' || CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'item_checked' ELSE 'item_updated' END , strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')   FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = NEW.list_id AND household_members.user_id <> NEW.updated_by   ON CONFLICT(group_key) WHERE group_key IS NOT NULL DO UPDATE SET title = excluded.title, body = excluded.body, grouped_until = excluded.grouped_until, updated_at = excluded.updated_at WHERE notifications.read_at IS NULL AND notifications.grouped_until >= excluded.created_at; END;
CREATE TRIGGER notifications_item_deleted AFTER DELETE ON shopping_items BEGIN   UPDATE notifications SET group_key = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')   WHERE group_key IN (SELECT household_members.user_id || ':' || OLD.updated_by || ':' || OLD.list_id || ':item_deleted' FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = OLD.list_id AND household_members.user_id <> OLD.updated_by)     AND (read_at IS NOT NULL OR grouped_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));   INSERT INTO notifications (id, user_id, type, title, body, household_id, list_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)   SELECT lower(hex(randomblob(16))), household_members.user_id, 'item_deleted', 'Producto eliminado', 'Se ha eliminado un producto de una lista compartida.', shopping_lists.household_id, OLD.list_id, OLD.updated_by, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes'), household_members.user_id || ':' || OLD.updated_by || ':' || OLD.list_id || ':item_deleted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')   FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = OLD.list_id AND household_members.user_id <> OLD.updated_by   ON CONFLICT(group_key) WHERE group_key IS NOT NULL DO UPDATE SET title = excluded.title, body = excluded.body, grouped_until = excluded.grouped_until, updated_at = excluded.updated_at WHERE notifications.read_at IS NULL AND notifications.grouped_until >= excluded.created_at; END;

ALTER TABLE nfc_links RENAME TO nfc_links_legacy;

CREATE TABLE nfc_links (
  id TEXT PRIMARY KEY,
  public_code TEXT NOT NULL UNIQUE,
  household_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO nfc_links (id, public_code, household_id, is_active, created_by, created_at, updated_at)
SELECT id, public_code, household_id, is_active, created_by, created_at, updated_at
FROM nfc_links_legacy;

DROP TABLE nfc_links_legacy;
