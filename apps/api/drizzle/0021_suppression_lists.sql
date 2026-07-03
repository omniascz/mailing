-- SendGrid-parity suppression lists: add `block` and `invalid_email` reasons.
-- ADD VALUE is not used in the same transaction, so IF NOT EXISTS is safe here.
ALTER TYPE "suppression_reason" ADD VALUE IF NOT EXISTS 'block';
ALTER TYPE "suppression_reason" ADD VALUE IF NOT EXISTS 'invalid_email';
