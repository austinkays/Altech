-- 0002_wrapped_master_keys.sql
-- Adds wrapped-master-key columns to user_crypto_meta so the v2 crypto
-- path can use a proper master-key + wrapping model.
--
-- Model:
--   MK = random 256-bit AES key generated once per user, encrypts all data.
--   passphrase_wrapped_mk = AES-GCM(MK) under PBKDF2(passphrase, passphrase_salt, passphrase_iterations)
--   recovery_wrapped_mk   = AES-GCM(MK) under PBKDF2(recovery_key, recovery_salt, recovery_iterations)
--
-- Consequences:
--   - Changing a passphrase only re-wraps MK. Data blobs stay put.
--   - Recovery key unwraps MK independently of the passphrase.
--   - Server never sees MK or either derived key.
--
-- Apply after 0001_initial_schema.sql. Safe to run on a table with zero
-- rows (expected: Phase 4 migration hasn't happened yet).

alter table public.user_crypto_meta
  add column if not exists passphrase_wrapped_mk text,        -- base64( iv(12) || AES-GCM(MK) )
  add column if not exists recovery_salt text,                 -- base64, 32 bytes, null until user attaches recovery key
  add column if not exists recovery_iterations int default 600000,
  add column if not exists recovery_wrapped_mk text;           -- base64, same shape as passphrase_wrapped_mk

comment on column public.user_crypto_meta.passphrase_wrapped_mk is
  'Master key encrypted under PBKDF2(passphrase, passphrase_salt, pbkdf2_iterations). Null until the vault has been created.';
comment on column public.user_crypto_meta.recovery_salt is
  'PBKDF2 salt for the recovery key (separate from passphrase_salt).';
comment on column public.user_crypto_meta.recovery_wrapped_mk is
  'Master key encrypted under PBKDF2(recovery_key, recovery_salt, recovery_iterations). Null if user has not created a recovery key.';

-- Recovery wrapping should exist iff its salt does. Enforce.
alter table public.user_crypto_meta
  add constraint recovery_pair_consistency
  check (
    (recovery_salt is null and recovery_wrapped_mk is null) or
    (recovery_salt is not null and recovery_wrapped_mk is not null)
  );
