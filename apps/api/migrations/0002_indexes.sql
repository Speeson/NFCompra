CREATE INDEX idx_auth_tokens_user_type_expires_at
  ON auth_tokens(user_id, type, expires_at);

CREATE INDEX idx_refresh_tokens_user_expires_at
  ON refresh_tokens(user_id, expires_at);

CREATE INDEX idx_invitations_email_expires_at
  ON invitations(email, expires_at);

CREATE INDEX idx_shopping_lists_household_id
  ON shopping_lists(household_id);

CREATE UNIQUE INDEX idx_shopping_lists_one_default_per_household
  ON shopping_lists(household_id)
  WHERE is_default = 1;

CREATE INDEX idx_shopping_items_list_id
  ON shopping_items(list_id);

CREATE INDEX idx_shopping_items_list_checked
  ON shopping_items(list_id, is_checked);

CREATE INDEX idx_shopping_items_list_normalized_name
  ON shopping_items(list_id, normalized_name);
