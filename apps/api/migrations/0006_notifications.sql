CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  household_id TEXT NULL,
  list_id TEXT NULL,
  invitation_id TEXT NULL,
  actor_user_id TEXT NULL,
  read_at TEXT NULL,
  grouped_until TEXT NULL,
  group_key TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_notifications_user_read_created
  ON notifications(user_id, read_at, created_at DESC);

CREATE INDEX idx_notifications_grouping
  ON notifications(user_id, actor_user_id, list_id, type, grouped_until);

CREATE UNIQUE INDEX idx_notifications_active_group
  ON notifications(group_key) WHERE group_key IS NOT NULL;

CREATE TRIGGER notifications_invitation_received AFTER INSERT ON invitations
WHEN NEW.status = 'pending'
BEGIN
  INSERT INTO notifications (id, user_id, type, title, body, household_id, invitation_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), users.id, 'invitation_received', 'Nueva invitación', 'Tienes una invitación pendiente para un hogar.', NEW.household_id, NEW.id, NEW.invited_by, NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM users WHERE users.email = NEW.invited_email AND users.email_verified_at IS NOT NULL;
END;

CREATE TRIGGER notifications_invitation_accepted AFTER UPDATE OF status ON invitations
WHEN OLD.status = 'pending' AND NEW.status = 'accepted'
BEGIN
  INSERT INTO notifications (id, user_id, type, title, body, household_id, invitation_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), NEW.invited_by, 'invitation_accepted', 'Invitación aceptada', 'Tu invitación a un hogar ha sido aceptada.', NEW.household_id, NEW.id, NULL, NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER notifications_member_removed AFTER DELETE ON household_members
WHEN OLD.role = 'member'
BEGIN
  INSERT INTO notifications (id, user_id, type, title, body, household_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)
  VALUES (lower(hex(randomblob(16))), OLD.user_id, 'member_removed', 'Ya no perteneces al hogar', 'Se te ha eliminado de un hogar compartido.', OLD.household_id, NULL, NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER notifications_item_created AFTER INSERT ON shopping_items
BEGIN
  UPDATE notifications SET group_key = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE group_key IN (SELECT household_members.user_id || ':' || NEW.created_by || ':' || NEW.list_id || ':item_created' FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = NEW.list_id AND household_members.user_id <> NEW.created_by)
    AND (read_at IS NOT NULL OR grouped_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  INSERT INTO notifications (id, user_id, type, title, body, household_id, list_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), household_members.user_id, 'item_created', 'Producto añadido', 'Se ha añadido un producto a una lista compartida.', shopping_lists.household_id, NEW.list_id, NEW.created_by, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes'), household_members.user_id || ':' || NEW.created_by || ':' || NEW.list_id || ':item_created', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = NEW.list_id AND household_members.user_id <> NEW.created_by
  ON CONFLICT(group_key) WHERE group_key IS NOT NULL DO UPDATE SET title = excluded.title, body = excluded.body, grouped_until = excluded.grouped_until, updated_at = excluded.updated_at WHERE notifications.read_at IS NULL AND notifications.grouped_until >= excluded.created_at;
END;

CREATE TRIGGER notifications_item_updated AFTER UPDATE OF name, normalized_name, quantity, unit, category, note, is_checked, position ON shopping_items
BEGIN
  UPDATE notifications SET group_key = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE group_key IN (SELECT household_members.user_id || ':' || NEW.updated_by || ':' || NEW.list_id || ':' || CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'item_checked' ELSE 'item_updated' END FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = NEW.list_id AND household_members.user_id <> NEW.updated_by)
    AND (read_at IS NOT NULL OR grouped_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  INSERT INTO notifications (id, user_id, type, title, body, household_id, list_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), household_members.user_id, CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'item_checked' ELSE 'item_updated' END, CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'Producto marcado' ELSE 'Producto actualizado' END, CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'Se ha marcado un producto en una lista compartida.' ELSE 'Se ha actualizado un producto en una lista compartida.' END, shopping_lists.household_id, NEW.list_id, NEW.updated_by, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes'), household_members.user_id || ':' || NEW.updated_by || ':' || NEW.list_id || ':' || CASE WHEN NEW.is_checked <> OLD.is_checked THEN 'item_checked' ELSE 'item_updated' END, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = NEW.list_id AND household_members.user_id <> NEW.updated_by
  ON CONFLICT(group_key) WHERE group_key IS NOT NULL DO UPDATE SET title = excluded.title, body = excluded.body, grouped_until = excluded.grouped_until, updated_at = excluded.updated_at WHERE notifications.read_at IS NULL AND notifications.grouped_until >= excluded.created_at;
END;

CREATE TRIGGER notifications_item_deleted AFTER DELETE ON shopping_items
BEGIN
  UPDATE notifications SET group_key = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE group_key IN (SELECT household_members.user_id || ':' || OLD.updated_by || ':' || OLD.list_id || ':item_deleted' FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = OLD.list_id AND household_members.user_id <> OLD.updated_by)
    AND (read_at IS NOT NULL OR grouped_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  INSERT INTO notifications (id, user_id, type, title, body, household_id, list_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), household_members.user_id, 'item_deleted', 'Producto eliminado', 'Se ha eliminado un producto de una lista compartida.', shopping_lists.household_id, OLD.list_id, OLD.updated_by, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes'), household_members.user_id || ':' || OLD.updated_by || ':' || OLD.list_id || ':item_deleted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM household_members INNER JOIN shopping_lists ON shopping_lists.household_id = household_members.household_id WHERE shopping_lists.id = OLD.list_id AND household_members.user_id <> OLD.updated_by
  ON CONFLICT(group_key) WHERE group_key IS NOT NULL DO UPDATE SET title = excluded.title, body = excluded.body, grouped_until = excluded.grouped_until, updated_at = excluded.updated_at WHERE notifications.read_at IS NULL AND notifications.grouped_until >= excluded.created_at;
END;
