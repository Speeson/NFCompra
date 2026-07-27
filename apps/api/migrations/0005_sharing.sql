DROP INDEX IF EXISTS idx_invitations_email_expires_at;

ALTER TABLE invitations RENAME TO invitations_legacy;

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  invited_email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TEXT NOT NULL,
  accepted_at TEXT NULL,
  revoked_at TEXT NULL,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id)
);

INSERT INTO invitations (id, household_id, invited_email, token_hash, status, expires_at, accepted_at, revoked_at, invited_by, created_at, updated_at)
SELECT id, household_id, lower(email), token_hash,
  CASE WHEN accepted_at IS NULL THEN 'pending' ELSE 'accepted' END,
  expires_at, accepted_at, NULL, invited_by, created_at, created_at
FROM invitations_legacy;

DROP TABLE invitations_legacy;

CREATE UNIQUE INDEX idx_invitations_active_household_email
  ON invitations(household_id, invited_email)
  WHERE status = 'pending';

CREATE INDEX idx_invitations_household_status
  ON invitations(household_id, status, created_at);
