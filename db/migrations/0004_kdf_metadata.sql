-- 0004_kdf_metadata.sql
-- Phase A: explicit KDF identifier + parameters on user_crypto_meta so the
-- v2 vault path can move from PBKDF2 (legacy) to Argon2id (new default)
-- without breaking existing records.
--
-- Backward compat:
--   - NULL passphrase_kdf  ⇒  legacy PBKDF2 with passphrase_iterations
--                            (the column from 0001/0002 stays the source
--                             of truth for legacy records).
--   - NULL kdf_tree        ⇒  MK is the AES data key directly (legacy).
--                            Set to 'hkdf-v1' on new vaults to enable
--                            HKDF-derived data key with domain separation.
--
-- New writes:
--   - passphrase_kdf        e.g. 'argon2id-v1' | 'pbkdf2-v2'
--   - passphrase_kdf_params jsonb — algorithm-specific parameters
--                                   Argon2id: { mem, time, parallelism }
--                                   PBKDF2:   { iterations }
--   - recovery_kdf, recovery_kdf_params — same shape, for the recovery key
--                                          unwrap path.
--   - kdf_tree              'hkdf-v1' enables HKDF subkey derivation.
--                          Set at vault creation; never changed thereafter
--                          (changing it would require re-encrypting all data).
--
-- Apply after 0003_agency_sharing.sql. Safe to run on tables with rows —
-- all new columns default to NULL and existing readers are tolerant of
-- their absence (see js/crypto-helper.js: unlockVault / unlockVaultWithRecoveryKey).

alter table public.user_crypto_meta
  add column if not exists passphrase_kdf        text,
  add column if not exists passphrase_kdf_params jsonb,
  add column if not exists recovery_kdf          text,
  add column if not exists recovery_kdf_params   jsonb,
  add column if not exists kdf_tree              text;

comment on column public.user_crypto_meta.passphrase_kdf is
  'KDF used to derive the passphrase KEK. NULL ⇒ legacy PBKDF2 with passphrase_iterations.';
comment on column public.user_crypto_meta.passphrase_kdf_params is
  'Algorithm-specific params. Argon2id: {mem,time,parallelism}; PBKDF2: {iterations}.';
comment on column public.user_crypto_meta.recovery_kdf is
  'KDF used to derive the recovery KEK. NULL ⇒ legacy PBKDF2 with recovery_iterations.';
comment on column public.user_crypto_meta.recovery_kdf_params is
  'Algorithm-specific params for the recovery KEK derivation.';
comment on column public.user_crypto_meta.kdf_tree is
  '''hkdf-v1'' = MK is a master seed; data key is HKDF-derived. NULL = MK used directly.';

-- Constrain known KDF identifiers — extend the CHECK as we add new ones.
-- Permissive on NULL so legacy records pass.
alter table public.user_crypto_meta
  drop constraint if exists passphrase_kdf_known,
  add  constraint passphrase_kdf_known
       check (passphrase_kdf is null
              or passphrase_kdf in ('pbkdf2-v2', 'argon2id-v1'));

alter table public.user_crypto_meta
  drop constraint if exists recovery_kdf_known,
  add  constraint recovery_kdf_known
       check (recovery_kdf is null
              or recovery_kdf in ('pbkdf2-v2', 'argon2id-v1'));

alter table public.user_crypto_meta
  drop constraint if exists kdf_tree_known,
  add  constraint kdf_tree_known
       check (kdf_tree is null or kdf_tree = 'hkdf-v1');
