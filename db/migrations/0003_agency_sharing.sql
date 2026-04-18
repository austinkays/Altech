-- 0003_agency_sharing.sql
-- Altech — Path B Phase 2.5 scaffolding: shared-agency data layer.
--
-- Adds the tables and crypto-metadata columns needed to share a subset of
-- data (CGL notes, quick-ref cards, glossary, etc.) across producers in the
-- same agency, while keeping per-user private data (clients, quotes) on the
-- existing user_blobs / user_quotes tables.
--
-- No application code ships against these tables yet. Apply this now so the
-- schema is in place when Phase 2.5 begins, and so nobody has to do a second
-- migration after users already exist in production.
--
-- Crypto model (client-side; server never sees plaintext):
--   1. Every user's vault gets a long-term keypair stored in user_crypto_meta:
--        - public_key              — raw, public, used to wrap agency keys for them
--        - wrapped_private_key     — private key encrypted under their personal MK
--      The private key is only ever decrypted in their browser after they unlock.
--   2. Each agency has a symmetric AGENCY_KEY generated once by the owner.
--   3. Each member has AGENCY_KEY wrapped under THEIR public key, stored in
--      agency_key_wraps. Revoking a member = delete their wrap + rotate the key.
--   4. agency_blobs.ciphertext is AES-256-GCM(plaintext) under AGENCY_KEY at
--      the current key_version. Members who hold the matching wrap can decrypt.
--
-- Apply after 0002_wrapped_master_keys.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- user_crypto_meta: add keypair for wrapping agency keys
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.user_crypto_meta
  add column if not exists public_key            text,  -- base64 raw SubtleCrypto export
  add column if not exists wrapped_private_key   text,  -- base64( iv || AES-GCM(privKey) under MK )
  add column if not exists keypair_algorithm     text default 'RSA-OAEP-4096',
  add column if not exists keypair_created_at    timestamptz;

comment on column public.user_crypto_meta.public_key is
  'Public half of the user''s wrapping keypair. Used by agency owners/admins to wrap AGENCY_KEY for this member.';
comment on column public.user_crypto_meta.wrapped_private_key is
  'Private half of the keypair, encrypted under the master key. Decrypted in-browser after vault unlock.';

-- Keypair pair consistency: either both present or both null.
alter table public.user_crypto_meta
  add constraint keypair_consistency
  check (
    (public_key is null and wrapped_private_key is null)
    or (public_key is not null and wrapped_private_key is not null)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- agencies
-- One row per agency. `name` is free-text; `owner_user_id` has break-glass
-- admin-level capabilities (create/revoke members, rotate keys).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.agencies (
  id             uuid        primary key default gen_random_uuid(),
  name           text        not null,
  owner_user_id  uuid        not null references auth.users(id),
  -- The version number of the current AGENCY_KEY. Incremented on rotation.
  -- New writes use the current version; readers must hold a matching wrap.
  key_version    int         not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint agency_name_nonempty check (length(trim(name)) > 0)
);

comment on table public.agencies is
  'One row per agency. owner_user_id is the only account with permission to invite/revoke members and rotate keys.';

-- ─────────────────────────────────────────────────────────────────────────────
-- agency_members
-- Who belongs to which agency, and in what role.
-- Role is application-defined:
--   'owner'  — exactly one per agency; the owner_user_id in agencies
--   'admin'  — can invite/revoke members; cannot transfer ownership
--   'member' — read/write access to agency_blobs; cannot manage membership
-- Soft-delete via revoked_at (preserves audit trail). A revoked member must
-- lose their row in agency_key_wraps in the same transaction.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.agency_members (
  agency_id    uuid        not null references public.agencies(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  role         text        not null default 'member',
  joined_at    timestamptz not null default now(),
  invited_by   uuid        references auth.users(id),
  revoked_at   timestamptz,
  primary key (agency_id, user_id),
  constraint role_known check (role in ('owner', 'admin', 'member'))
);

create index agency_members_user_active_idx
  on public.agency_members (user_id)
  where revoked_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- agency_key_wraps
-- Per-member wrapping of the current AGENCY_KEY, encrypted under that
-- member's public_key. One row per (agency, member, key_version) so that
-- during a key rotation both old and new wraps can coexist briefly.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.agency_key_wraps (
  agency_id           uuid        not null references public.agencies(id) on delete cascade,
  user_id             uuid        not null references auth.users(id) on delete cascade,
  key_version         int         not null,
  wrapped_agency_key  text        not null,  -- base64( RSA-OAEP(AGENCY_KEY, member.public_key) )
  created_at          timestamptz not null default now(),
  primary key (agency_id, user_id, key_version),
  constraint wrapped_size check (length(wrapped_agency_key) <= 4096)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- agency_blobs
-- The shared-data equivalent of user_blobs. Ciphertext is encrypted under
-- AGENCY_KEY at key_version. Any active member with a matching wrap can
-- decrypt. updated_by tags the most recent writer for audit purposes.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.agency_blobs (
  agency_id    uuid        not null references public.agencies(id) on delete cascade,
  doc_key      text        not null,
  ciphertext   text        not null,         -- base64( iv(12) || AES-256-GCM(payload) )
  key_version  int         not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid        references auth.users(id),
  primary key (agency_id, doc_key),
  constraint agency_ciphertext_size check (length(ciphertext) <= 1048576)
);

comment on table public.agency_blobs is
  'Shared per-agency key-value store. Ciphertext is encrypted under the agency key at its current version; server never sees plaintext.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Membership helper — used by RLS policies to avoid recursive references
-- to agency_members. SECURITY DEFINER so the function can read the table
-- regardless of the caller's own RLS context.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_agency_member(_agency uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
    where agency_id = _agency
      and user_id   = _user
      and revoked_at is null
  );
$$;

create or replace function public.is_agency_admin(_agency uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
    where agency_id = _agency
      and user_id   = _user
      and role in ('owner', 'admin')
      and revoked_at is null
  );
$$;

-- Lock down who can call these helpers. authenticated is sufficient; anon
-- has no reason to probe membership.
revoke all on function public.is_agency_member(uuid, uuid) from public;
revoke all on function public.is_agency_admin(uuid, uuid) from public;
grant execute on function public.is_agency_member(uuid, uuid) to authenticated;
grant execute on function public.is_agency_admin(uuid, uuid)  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.agencies           enable row level security;
alter table public.agency_members     enable row level security;
alter table public.agency_key_wraps   enable row level security;
alter table public.agency_blobs       enable row level security;

-- agencies: visible to members; only the owner can update metadata (name,
-- key_version). INSERT is via a server-side function in Phase 2.5 (not from
-- client) — no client INSERT policy.
create policy "agencies_select_for_members" on public.agencies
  for select using (public.is_agency_member(id, auth.uid()));
create policy "agencies_update_for_owner" on public.agencies
  for update using (owner_user_id = auth.uid())
              with check (owner_user_id = auth.uid());

-- agency_members: members of an agency can see the full member list.
-- Admins and the owner can insert/update/delete. Self-revoke (a member
-- leaving voluntarily) is handled via RPC, not direct DELETE.
create policy "members_select_for_agency_members" on public.agency_members
  for select using (public.is_agency_member(agency_id, auth.uid()));
create policy "members_insert_for_admins" on public.agency_members
  for insert with check (public.is_agency_admin(agency_id, auth.uid()));
create policy "members_update_for_admins" on public.agency_members
  for update using (public.is_agency_admin(agency_id, auth.uid()))
              with check (public.is_agency_admin(agency_id, auth.uid()));
create policy "members_delete_for_admins" on public.agency_members
  for delete using (public.is_agency_admin(agency_id, auth.uid()));

-- agency_key_wraps: a member can read ONLY their own wrap row.
-- Admins can insert wraps for any member (needed during invite + rotation).
-- Delete is admin-only; used during revocation.
create policy "wraps_select_self" on public.agency_key_wraps
  for select using (user_id = auth.uid());
create policy "wraps_insert_by_admin" on public.agency_key_wraps
  for insert with check (public.is_agency_admin(agency_id, auth.uid()));
create policy "wraps_delete_by_admin" on public.agency_key_wraps
  for delete using (public.is_agency_admin(agency_id, auth.uid()));
-- No update policy: rotation is insert new, delete old.

-- agency_blobs: any active member can read. Any active member can write
-- (insert/update). Delete is admin-only to prevent accidental wipes by
-- ordinary members.
create policy "blobs_select_for_members" on public.agency_blobs
  for select using (public.is_agency_member(agency_id, auth.uid()));
create policy "blobs_insert_for_members" on public.agency_blobs
  for insert with check (
    public.is_agency_member(agency_id, auth.uid())
    and (updated_by is null or updated_by = auth.uid())
  );
create policy "blobs_update_for_members" on public.agency_blobs
  for update using (public.is_agency_member(agency_id, auth.uid()))
              with check (
    public.is_agency_member(agency_id, auth.uid())
    and (updated_by is null or updated_by = auth.uid())
  );
create policy "blobs_delete_for_admins" on public.agency_blobs
  for delete using (public.is_agency_admin(agency_id, auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers (reuse the function defined in 0001)
-- ─────────────────────────────────────────────────────────────────────────────
create trigger agencies_set_updated_at
  before update on public.agencies
  for each row execute function public.tg_set_updated_at();

create trigger agency_blobs_set_updated_at
  before update on public.agency_blobs
  for each row execute function public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- New audit events for Phase 2.5. Extend the event_type check.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.audit_log drop constraint if exists event_type_known;
alter table public.audit_log add constraint event_type_known check (
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
    'sync_enabled',
    'keypair_generated',
    'agency_created',
    'agency_member_invited',
    'agency_member_joined',
    'agency_member_revoked',
    'agency_key_rotated',
    'agency_role_changed'
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries — run after apply.
-- ─────────────────────────────────────────────────────────────────────────────
-- As anon (should all return 0 rows, never error):
--   select count(*) from public.agencies;
--   select count(*) from public.agency_members;
--   select count(*) from public.agency_blobs;
--   select count(*) from public.agency_key_wraps;
--
-- As authenticated user A with no memberships (should all return 0 rows):
--   select count(*) from public.agencies;
--   select count(*) from public.agency_blobs;
--
-- Attempt cross-agency read (should return 0 rows, not an error):
--   select * from public.agency_blobs where agency_id = '<other-agency-uuid>'::uuid;
--
-- Attempt to self-insert into agency_members for an agency you don't admin
-- (should raise a new row violates row-level security policy error):
--   insert into public.agency_members (agency_id, user_id, role)
--   values ('<agency-uuid>'::uuid, auth.uid(), 'member');
