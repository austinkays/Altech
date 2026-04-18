-- 0001_initial_schema.sql
-- Altech — Path B (Supabase + E2E encrypted blobs)
-- Apply this after creating the new Supabase project, before any client code points at it.
--
-- Apply via Supabase dashboard → SQL Editor, OR via CLI:
--   supabase db push
--
-- All tables use Row Level Security. The rules are simple by design:
-- a row belongs to a user iff user_id = auth.uid(). No admin overrides at
-- the SQL level — admin capabilities live in application code, with an
-- explicit audit_log entry per privileged action.

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;
-- pgaudit is for Phase 6 (server-side audit of every write). Uncomment then.
-- create extension if not exists pgaudit;

-- ─────────────────────────────────────────────────────────────────────────────
-- user_blobs
-- The Supabase-native equivalent of Firebase's users/{uid}/sync/{docType}.
-- Each row is an opaque AES-256-GCM-encrypted blob. The server never sees
-- plaintext. doc_key is the equivalent of SYNC_DOCS in cloud-sync.js.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.user_blobs (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  doc_key     text        not null,
  ciphertext  text        not null,         -- base64( iv(12) || AES-256-GCM(payload) )
  updated_at  timestamptz not null default now(),
  device_id   text,
  primary key (user_id, doc_key),
  -- Keep ciphertext reasonable. 1 MB per doc is generous — larger blobs should
  -- be decomposed into smaller doc_keys or moved to Supabase Storage.
  constraint ciphertext_size check (length(ciphertext) <= 1048576)
);
comment on table public.user_blobs is
  'E2E-encrypted per-user key-value store. Server sees only ciphertext.';

alter table public.user_blobs enable row level security;

create policy "own_blobs_select" on public.user_blobs
  for select using (auth.uid() = user_id);
create policy "own_blobs_insert" on public.user_blobs
  for insert with check (auth.uid() = user_id);
create policy "own_blobs_update" on public.user_blobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_blobs_delete" on public.user_blobs
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- user_quotes
-- One row per saved draft. Separate from user_blobs so we can paginate by
-- updated_at without loading every quote at once.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.user_quotes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  ciphertext  text        not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint quote_ciphertext_size check (length(ciphertext) <= 1048576)
);
create index user_quotes_user_updated_idx
  on public.user_quotes (user_id, updated_at desc);

alter table public.user_quotes enable row level security;
create policy "own_quotes_all" on public.user_quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- user_crypto_meta
-- Per-user encryption parameters. Stores the PBKDF2 salt and the recovery-key
-- hash — NEVER the key itself and NEVER the passphrase.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.user_crypto_meta (
  user_id            uuid        primary key references auth.users(id) on delete cascade,
  passphrase_salt    text        not null,                   -- base64, 32 bytes
  recovery_key_hash  text,                                    -- argon2id / sha-256 hash of the mnemonic
  pbkdf2_iterations  int         not null default 600000,
  created_at         timestamptz not null default now(),
  rotated_at         timestamptz,
  constraint salt_length check (length(passphrase_salt) between 32 and 128)
);

alter table public.user_crypto_meta enable row level security;
create policy "own_crypto_meta_all" on public.user_crypto_meta
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_log
-- App-level audit trail. pgaudit (Phase 6) handles low-level Postgres writes;
-- this table captures business events (login, passphrase change, recovery
-- key used, export, delete). Append-only — no update/delete policy.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.audit_log (
  id         bigserial   primary key,
  user_id    uuid        references auth.users(id),
  event_type text        not null,
  ip_address inet,
  user_agent text,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  constraint event_type_known check (
    event_type in (
      'login',
      'login_failed',
      'logout',
      'passphrase_set',
      'passphrase_change',
      'passphrase_reset_via_recovery_key',
      'recovery_key_exported',
      'mfa_enrolled',
      'mfa_disabled',
      'data_exported',
      'account_deleted',
      'sync_disabled',
      'sync_enabled'
    )
  )
);
create index audit_log_user_created_idx
  on public.audit_log (user_id, created_at desc);

alter table public.audit_log enable row level security;
create policy "own_audit_select" on public.audit_log
  for select using (auth.uid() = user_id);
create policy "audit_insert" on public.audit_log
  for insert with check (auth.uid() = user_id);
-- No update/delete policy → append-only. Postgres will refuse.

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- Supabase convention: keep updated_at fresh on every row update.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_blobs_set_updated_at
  before update on public.user_blobs
  for each row execute function public.tg_set_updated_at();

create trigger user_quotes_set_updated_at
  before update on public.user_quotes
  for each row execute function public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries — run these after apply to confirm RLS works.
-- ─────────────────────────────────────────────────────────────────────────────
-- As anon: should return 0 rows, never error.
--   select count(*) from public.user_blobs;
-- As authenticated user A: should see only their own rows.
--   select count(*) from public.user_blobs;
-- Attempting cross-user write should fail with row-level-security violation:
--   insert into public.user_blobs (user_id, doc_key, ciphertext)
--   values ('<other-user-id>'::uuid, 'test', 'xxx');
