-- Agora — WebAuthn (passkey) support.
-- Registration requires a verified passkey ceremony before an account is created;
-- afterwards members can sign in with either their passkey or their password.

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  credential_id TEXT PRIMARY KEY,          -- base64url credential ID from the authenticator
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key   TEXT NOT NULL,              -- base64url-encoded COSE public key
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT NOT NULL DEFAULT '[]', -- JSON array of transport hints
  device_type  TEXT NOT NULL DEFAULT 'singleDevice',
  backed_up    INTEGER NOT NULL DEFAULT 0,
  user_handle  TEXT NOT NULL DEFAULT '',   -- base64url user handle issued at registration
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webauthn_creds_user ON webauthn_credentials(user_id);

-- Short-lived challenge rows backing both ceremonies. `data` holds the verified
-- credential JSON between the register/verify step and account creation.
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  token      TEXT PRIMARY KEY,             -- opaque token handed to the client
  kind       TEXT NOT NULL CHECK (kind IN ('register', 'login')),
  challenge  TEXT NOT NULL,                -- base64url challenge the authenticator must sign
  user_id    TEXT,                         -- login only: resolved user when a username was given
  data       TEXT,                         -- register only: verified credential JSON awaiting signup
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webauthn_ch_exp ON webauthn_challenges(expires_at);
