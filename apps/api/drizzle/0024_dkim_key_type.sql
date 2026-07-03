-- DKIM key algorithm per sending domain (RFC 8463 Ed25519 support).
ALTER TABLE "sending_domains" ADD COLUMN IF NOT EXISTS "dkim_key_type" varchar(16) DEFAULT 'rsa' NOT NULL;
