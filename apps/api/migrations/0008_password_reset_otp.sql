ALTER TABLE auth_tokens ADD COLUMN otp_hash TEXT NULL;
ALTER TABLE auth_tokens ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_auth_tokens_otp_hash
  ON auth_tokens(otp_hash)
  WHERE otp_hash IS NOT NULL;
