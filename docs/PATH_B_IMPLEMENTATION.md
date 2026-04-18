# Path B — End-to-End Encrypted Sync on Supabase

> Implementation plan for the full security remediation of Altech. Companion to `~/.claude/plans/give-me-a-detailed-async-quilt.md` (the original security assessment) and the April 17, 2026 commits that shipped the Path A fallback (DL scanner removal, cloud-sync opt-out, bug-report email scrub).

---

## Goal

Migrate the app from **Firebase Auth + Firestore (plaintext-at-rest NPI)** to **Supabase Auth + Postgres (client-side-encrypted blobs only)**, so that a breach of the backend exposes zero client data. At the same time:

- Add MFA enforcement for any account with cloud sync enabled.
- Derive encryption keys from a user passphrase (not device fingerprint).
- Keep an encrypted recovery key the user can export.
- Satisfy every item on the FTC Safeguards Rule (2023) 12-point checklist.

---

## Decisions — locked as of April 17, 2026

- **D1 — Supabase project**: **new dedicated Altech project** ✓
- **D2 — Auth system**: **Supabase Auth** with a one-time Firebase → Supabase migration flow ✓
- **D3 — Passphrase UX**: **separate passphrase** with mandatory recovery-key export ✓ (assumed; user signal was "clean it up" — simplest correct path)
- **D4 — Data migration**: **one-shot cutover** on a Saturday ✓ (assumed; trivial with 5 users)
- **D5 — User count**: **5 users** ✓

_Kept below for audit trail and in case we revisit._

### D1 — Supabase project: reuse Salve's, or new dedicated project?

| Option | Pros | Cons |
|---|---|---|
| **Reuse Salve's project** (new schema `altech`) | One dashboard, one DPA, one set of secrets, cheaper | Shared rate limits/quotas; a Salve incident means an Altech incident; RLS policies get more complex |
| **New `altech` project** | Clean blast radius, independent auth users, simpler RLS | Two dashboards, two DPAs, two sets of secrets |

**Recommended: new dedicated Altech project.** Per-product isolation is the right default for anything touching regulated data. You can still use the same Supabase organization for consolidated billing.

### D2 — Auth system: Supabase Auth vs. keep Firebase Auth

| Option | Pros | Cons |
|---|---|---|
| **Move to Supabase Auth** | One stack; MFA is straightforward; JWT integrates natively with RLS | Users have to re-authenticate; password reset emails come from a new sender; lose existing admin/block flags |
| **Keep Firebase Auth, add custom JWT claim for Supabase** | No re-auth, existing admin panel stays intact | Adds a JWT-exchange step to every sync call; two auth systems to maintain |

**Recommended: move to Supabase Auth, with a one-time "migrate my account" flow** that verifies the old Firebase password, creates a matching Supabase user, and flips a `migrated` flag in the old Firebase user doc so we know they're done.

### D3 — Passphrase UX

The encryption passphrase is separate from the login password. Two choices:

| Option | Pros | Cons |
|---|---|---|
| **Same string** — the login password IS the passphrase | One credential to remember; simpler UX | Can't change password without re-encrypting all data; password reset = permanent data loss |
| **Separate passphrase** — set once during onboarding, stored never | Password change is cheap; clear mental model ("this unlocks my client data") | Two credentials; user must back up recovery key |

**Recommended: separate passphrase** with a mandatory one-time recovery-key export during onboarding (download a .txt file, save to a password manager).

### D4 — Data migration strategy

| Option | Pros | Cons |
|---|---|---|
| **One-shot cutover** — freeze Firebase writes, migrate everything, redirect | Simple; one migration script; no dual-write bugs | Downtime window (~minutes); users on mobile during cutover may lose unsaved work |
| **Dual-write period** — write to both Firebase and Supabase for 2 weeks, then flip | No downtime; graceful rollback | Double the write cost; bugs can desync; migration code lingers in the codebase |

**Recommended: one-shot cutover during off hours** (Saturday 2 AM Pacific). Users open app Monday morning and are prompted to migrate. Firebase data stays read-only for 90 days as a rollback safety net.

### D5 — Is the boss the only current user, or are there others?

Changes the migration urgency. If it's just you + her, we can cutover aggressively. If there are other users, we need clearer comms.

---

## Implementation phases (assuming above decisions go with the "Recommended" options)

Each phase is independently shippable and gated behind a feature flag. No phase breaks the current app.

### Phase 0 — Foundation (1–2 days)

**Status:** Scaffolding shipped April 17, 2026. Two manual steps remain before Phase 1 can start (create project, sign DPAs).

- [x] Create `db/migrations/0001_initial_schema.sql` (see schema below).
- [x] Create `js/supabase-config.js` — dormant stub, no-op until env vars are set. No `<script>` tag in `index.html` yet; added in Phase 2.
- [x] Write `docs/WISP.md` and `docs/incident-response.md`.
- [ ] **YOU:** Create new Supabase project named `altech` in the same org as Salve. Region: `us-west-1` (Oregon, closest to WA).
- [ ] **YOU:** Apply `db/migrations/0001_initial_schema.sql` via the Supabase SQL editor.
- [ ] **YOU:** Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Vercel project settings (Production + Preview). Add `SUPABASE_SERVICE_ROLE_KEY` to Production only — never Preview.
- [ ] **YOU:** Sign Supabase DPA (Dashboard → Settings → Legal) and Vercel DPA (Dashboard → Settings → General → Data Processing Addendum).
- [ ] **YOU (before Phase 2 ships):** Decide on Vertex AI migration for Gemini calls, OR accept that property/owner enrichment continues under Google's consumer AI terms.
- [ ] **Gate**: new Supabase client exists but does nothing. App behavior unchanged until Phase 2.

### Phase 1 — Passphrase-derived crypto (3–5 days)

**Status:** Library work done. UI (Stage 1c) remaining. No user-facing change yet.

- [x] **Stage 1a** — `js/crypto-helper.js` now supports a v2 passphrase path parallel to the legacy v1 device-bound path. PBKDF2 bumped 100k → 600k (OWASP 2023). Feature flag `E2E_CRYPTO_V2` controls activation; default off. Added in-memory key caching for both paths (free perf win). `encrypt()` throws `CRYPTO_LOCKED` when v2 is enabled but locked, preventing silent writes under the wrong key.
- [x] **Stage 1b** — Refactored v2 to **master-key + wrapping** model. Changing a passphrase now re-wraps MK (cheap) rather than re-encrypting every blob. New API: `createVault`, `unlockVault`, `changePassphrase`, `generateRecoveryKey`, `parseRecoveryKey`, `formatRecoveryKey`, `wrapWithRecoveryKey`, `unlockVaultWithRecoveryKey`. Recovery key: 32 random bytes hex-formatted as 4 groups of 16, case/whitespace-tolerant on parse. `db/migrations/0002_wrapped_master_keys.sql` adds the wrapping columns. **Revised from plan:** BIP39 24-word mnemonic replaced with hex format (~67 chars) — smaller wordlist-free bundle, still typeable, still saveable in a password manager.
- [ ] **Stage 1c** — UI flows:
  - Passphrase onboarding modal: set → confirm → generate recovery key → require "I saved this" checkbox → download .txt → upload wrapped blobs.
  - Passphrase unlock modal on every session start (replaces silent device-key unlock).
  - Change-passphrase flow in Account → Security.
  - Recovery flow: "I forgot my passphrase" → paste recovery key → reset passphrase.
- [ ] **Gate (still in place)**: `E2E_CRYPTO_V2`. Default off. Stage 1c will also add a `VAULT_SERVER_META` local-storage key to cache the server's crypto-meta blob for offline unlock support (optional).

### Phase 2 — Supabase schema + RLS (2–3 days)

- [ ] Apply schema (below) to Supabase.
- [ ] RLS policies for every table. Rule of thumb: `auth.uid() = user_id` on read/write.
- [ ] Write `js/supabase-sync.js` — the Supabase equivalent of `js/cloud-sync.js`, except it ONLY handles opaque encrypted blobs. No `_decryptForSync`.
- [ ] Add `SupabaseSync.pushBlob(docKey, ciphertext, updatedAt)`, `pullBlob(docKey)`, `listQuotes()`, `deleteBlob(docKey)`.
- [ ] **Gate**: feature flag `SYNC_BACKEND=supabase` in localStorage. Default `firebase`. When `supabase`, new sync path; when `firebase`, legacy path.

### Phase 3 — Supabase Auth (2 days)

- [ ] Build Supabase Auth signup/login/reset modal (parallel to existing Firebase one, not replacing yet).
- [ ] Enable MFA (TOTP) as REQUIRED for users with cloud sync enabled. Soft-enforce on first login after Phase 3 ships.
- [ ] Admin panel adaptation: read `is_admin`/`is_blocked` from Supabase user metadata instead of Firebase custom claims.
- [ ] **Gate**: same `SYNC_BACKEND` flag controls which auth modal appears.

### Phase 4 — Migration flow (3–5 days)

- [ ] One-time "Migrate to the new secure backend" modal, shown once per user after they sign in to Firebase:
  1. Verify current Firebase password.
  2. Pull all Firebase data, decrypt with legacy key.
  3. Prompt for new passphrase + confirm.
  4. Re-encrypt all payloads under passphrase-derived key.
  5. Create Supabase user (same email).
  6. Push all blobs to Supabase.
  7. Flip `SYNC_BACKEND=supabase`, `E2E_CRYPTO_V2=true` in localStorage.
  8. Mark Firebase user doc with `migrated=true`, `migratedAt=<ts>`.
- [ ] Show recovery key export at end of flow (mandatory step).
- [ ] Post-migration: Firebase data remains read-only. 90-day retention, then hard delete.
- [ ] **Gate**: environment flag `MIGRATION_ENABLED=true`.

### Phase 5 — Decommission Firebase (1 day, T+90 days)

- [ ] Delete Firebase data for all migrated users.
- [ ] Remove `js/firebase-config.js`, `js/auth.js` (Firebase flavor), `js/cloud-sync.js` (Firebase flavor).
- [ ] Rename `js/supabase-sync.js` → `js/cloud-sync.js`.
- [ ] Remove feature flags.
- [ ] Update `CLAUDE.md`, `AGENTS.md`, docs.

### Phase 6 — Paper trail + SOC prep (1 day)

- [ ] Finalize `docs/WISP.md` with each Safeguards Rule item mapped to a specific control.
- [ ] Document `docs/incident-response.md` with named contacts + state DOI 72-hour notification template.
- [ ] Document retention policy (active clients: until closed + 7 years; inactive: auto-archive at 2 years).
- [ ] Enable Postgres audit logging in Supabase (`pgaudit` extension) for all writes to tables containing NPI blobs.
- [ ] Annual review checklist in `docs/security-annual-review.md`.

---

## Proposed Supabase schema

```sql
-- User-scoped key-value store for encrypted blobs.
-- Corresponds to Firebase's users/{uid}/sync/{docType} docs.
create table user_blobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_key text not null,            -- 'currentForm' | 'quotes' | 'cglState' | ...
  ciphertext text not null,         -- base64( iv(12) || AES-256-GCM(payload) )
  updated_at timestamptz not null default now(),
  device_id text,
  primary key (user_id, doc_key)
);

-- One row per saved quote (separate from user_blobs for indexed listing).
create table user_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  client_name_hash text,            -- HMAC-SHA256(name, user_key); lets server search without knowing name
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on user_quotes(user_id, updated_at desc);

-- Per-user encryption metadata. Stores the PBKDF2 salt (NOT the key) and recovery-key hash.
create table user_crypto_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  passphrase_salt text not null,    -- base64, 32 bytes
  recovery_key_hash text,           -- argon2id hash of the 24-word mnemonic; proves user backed it up
  pbkdf2_iterations int not null default 600000,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

-- Audit log for sensitive actions. pgaudit handles low-level writes; this is for app-level events.
create table audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id),
  event_type text not null,         -- 'login' | 'passphrase_change' | 'recovery_key_used' | 'export_data' | 'delete_account'
  ip_address inet,
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log(user_id, created_at desc);

-- RLS policies
alter table user_blobs enable row level security;
create policy "own_blobs_select" on user_blobs for select using (auth.uid() = user_id);
create policy "own_blobs_insert" on user_blobs for insert with check (auth.uid() = user_id);
create policy "own_blobs_update" on user_blobs for update using (auth.uid() = user_id);
create policy "own_blobs_delete" on user_blobs for delete using (auth.uid() = user_id);

alter table user_quotes enable row level security;
create policy "own_quotes_all" on user_quotes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table user_crypto_meta enable row level security;
create policy "own_crypto_meta_all" on user_crypto_meta for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table audit_log enable row level security;
create policy "own_audit_select" on audit_log for select using (auth.uid() = user_id);
create policy "audit_insert" on audit_log for insert with check (auth.uid() = user_id);
-- No update/delete on audit_log — append-only.
```

---

## Out-of-scope (for this work)

- **Migrating any other consumer** of Firebase (dashboards, cron jobs, property-intelligence caching). Those can live on Firebase indefinitely — only NPI-carrying paths need to move.
- **Server-side NPI processing.** `api/property-intelligence.js`, `api/vision-processor.js`, etc., still call third-party APIs with non-NPI (addresses, property photos). Those are orthogonal to storage encryption. Moving Gemini → Vertex AI is recommended but separate.
- **Shared agency accounts.** Assumes each user has their own account. Multi-user / team mode would need a different crypto model (per-team key escrow) and is a v2 feature.

---

## What I need from you to start Phase 0

Answer the five decisions above. If you want the "Recommended" on all five, reply "go with recommendations" and I'll start Phase 0 next turn. Otherwise, flag the ones you want different.
