# Altech Encryption, MFA, and Supabase Sync — Deep Dive

> **Scope.** This document explains how Altech protects user data at rest and in transit:
> the cryptographic primitives, key derivation, vault lifecycle, TOTP MFA, Supabase
> Postgres schema/RLS, and the Firebase → Supabase migration story.
>
> **Note on terminology.** Altech is an insurance intake toolkit. The encrypted blobs are
> personally identifiable information (PII): names, addresses, drivers, vehicles, dwelling
> details, quotes, etc. There is no literal protected health information (PHI) — the
> "sensitive data" that flows through `App.data` is insurance‑grade PII handled with
> medical‑grade end‑to‑end encryption.

---

## 1. Cryptographic Foundations

### 1.1 Algorithms (Web Crypto API only — no third‑party libraries)

| Purpose | Algorithm | Parameters |
|---------|-----------|------------|
| Symmetric encryption | **AES‑256‑GCM** | 256‑bit key, 12‑byte random IV per message, 128‑bit auth tag (GCM default) |
| Key derivation | **PBKDF2‑HMAC‑SHA256** | v2 default **600,000** iterations (OWASP 2023); v1 legacy 100,000 |
| RNG | `crypto.getRandomValues` | All salts, IVs, MK bytes, recovery keys |
| Encoding | base64 (transport), hex (recovery key display) | base64 for ciphertext+salts, hex for fingerprints/recovery key |

**Ciphertext envelope** — every encrypted blob, whether `App.data`, a quote, or a
wrapped master key, has the same wire format:

```
base64( iv[12 bytes] || AES-256-GCM-ciphertext-with-auth-tag )
```

The IV is prepended to the ciphertext before base64 encoding. On decryption the first
12 bytes (after base64 decode) are read as the IV and the remainder is fed to
`crypto.subtle.decrypt`. GCM provides AEAD, so any tampering or wrong key fails the
auth tag and `decrypt` throws.

Source: `js/crypto-helper.js` lines 22, 151–152, 211–213, 233.

### 1.2 Two Encryption Paths

The codebase ships **both** paths simultaneously. The active path is selected at runtime
by `localStorage[STORAGE_KEYS.E2E_CRYPTO_V2]`.

#### Path v1 — Device‑Bound (legacy default)

```
deviceFingerprint = SHA-256( random32ByteSalt || "ALTECH_FIELD_PRO_v2" )

key = PBKDF2(
  password   = deviceFingerprint as hex string,
  salt       = "altech_v6_salt_2026" (UTF-8, hardcoded),
  iterations = 100,000,
  hash       = SHA-256,
  outputLen  = 256 bits → AES-GCM key
)
```

The 32‑byte device salt is stored at `STORAGE_KEYS.ENCRYPTION_SALT`
(`altech_encryption_salt`) **and is never synced to the cloud**. Consequence: v1
ciphertext is bound to the device that produced it. Cross‑device sync of v1 blobs is
impossible without sharing the device salt, which is intentionally not done.

Source: `js/crypto-helper.js` lines 61–96.

#### Path v2 — Passphrase‑Derived End‑to‑End (E2E)

The user picks a passphrase. A **random 256‑bit master key (MK)** is generated once
per user and used to encrypt every data blob. The MK itself is **wrapped** (encrypted)
twice — once under a passphrase‑derived KEK, once under a recovery‑key‑derived KEK:

```
MK ← crypto.getRandomValues(32 bytes)                             // never leaves the client unwrapped

passphrase_KEK = PBKDF2(passphrase_NFKC, passphrase_salt[32B], 600_000)
passphrase_wrapped_MK = base64( iv[12B] || AES-256-GCM(MK, passphrase_KEK) )

recovery_KEK = PBKDF2(recovery_hex_64chars, recovery_salt[32B], 600_000)
recovery_wrapped_MK = base64( iv[12B] || AES-256-GCM(MK, recovery_KEK) )
```

* Passphrase is normalized to **NFKC** before hashing (Unicode safety, Supabase best practice).
* MK is imported as a `CryptoKey` with `extractable: true` so passphrase changes can re‑wrap
  it without prompting the user again.
* MK lives in memory only (`_v2Key`). Lock or logout nulls it. Temporary `Uint8Array`s of MK
  bytes are zeroed (`.fill(0)`) after wrapping operations — best effort in JS, since the runtime
  can still copy bytes during GC.
* The server never sees the passphrase, the recovery key, or the unwrapped MK.

Source: `js/crypto-helper.js` lines 98–189 (primitives), 269–468 (public API).

### 1.3 Recovery Key

* 32 random bytes → 64 hex characters
* Displayed grouped 16‑16‑16‑16 with hyphens (QR/print‑friendly):

  ```
  A3F5E72D9C018B44-1E76FCA0D835219B-7502CC6E3F8A91BD-4DE28B1F95C063AA
  ```

* Parsing strips whitespace and hyphens, validates 64 hex chars, then case‑folds.
* Never stored server‑side. The user is responsible for backing it up. The download
  button writes a plain‑text file.

Source: `js/crypto-helper.js` lines 388–468.

### 1.4 Salts at a Glance

| Salt | Where | Bytes | Synced? | Purpose |
|------|-------|-------|---------|---------|
| `ENCRYPTION_SALT` | `localStorage` | 32 (hex) | **Never** | v1 device fingerprint material |
| `passphrase_salt` | Supabase `user_crypto_meta.passphrase_salt` (base64) | 32 | Yes (it's just a salt; PBKDF2 needs server delivery) | Derives passphrase KEK |
| `recovery_salt` | Supabase `user_crypto_meta.recovery_salt` (base64) | 32 | Yes | Derives recovery‑key KEK |
| Passphrase / recovery key | **Nowhere** server‑side | — | Never | User‑held secret |

The pair `(recovery_salt, recovery_wrapped_mk)` is constrained to be both‑set or both‑null
at the database level (see §4.1).

---

## 2. Application Encryption Hooks

### 2.1 What Gets Encrypted

Anything synced. The `DOC_LOCAL_KEYS` map in `js/supabase-sync.js` (lines 32–45) is the
authoritative list:

| `doc_key` (server) | Local storage key | Purpose |
|--------------------|-------------------|---------|
| `currentForm` | `altech_v6` | Main intake form (`App.data`) |
| `cglState` | `altech_cgl_state` | Compliance dashboard |
| `clientHistory` | `altech_client_history` | Past clients |
| `quickRefCards` / `quickRefNumbers` / `quickRefEmojis` | `altech_quickref_*` | Quick reference data |
| `reminders` | `altech_reminders` | User reminders |
| `glossary` | `altech_agency_glossary` | Custom terms |
| `vaultData` / `vaultMeta` | `altech_acct_vault*` | Account vault |
| `commercialDraft` / `commercialQuotes` | `altech_commercial_*` | Commercial quoter |

Quotes are encrypted individually and pushed to the `user_quotes` table by ID.

`ENCRYPTION_SALT`, `PASSPHRASE_SALT`, and `*_RECOVERY` keys are **never** synced.

### 2.2 Save Path

`App.save()` (`js/app-core.js` lines 745–796):

1. Debounce, then deep‑clone `App.data` and stamp `_schemaVersion`.
2. If `encryptionEnabled`, call `CryptoHelper.encrypt(dataToSave)` → base64 ciphertext.
3. `localStorage.setItem('altech_v6', ciphertext)`.
4. `window.Sync.schedulePush()` (debounced 3 s) hands the ciphertext to whichever backend is active.

`CryptoHelper.encrypt` chooses the active key:

* If v2 is enabled and unlocked → MK.
* Else → v1 device key.

### 2.3 Load Path with Recovery Bucket

`App.load()` (`js/app-core.js` lines 799–826):

1. Read ciphertext from `localStorage`.
2. Try `CryptoHelper.decrypt`. If it returns `null` or throws, **don't drop the data**:
   park the original ciphertext in `STORAGE_KEYS.DECRYPTION_RECOVERY` (FIFO, max 20 entries),
   toast the user, and continue. This protects against bugs and key‑mismatch scenarios:
   the user can later recover with their recovery key without losing prior data.
3. On success, run `_migrateSchema(decrypted)` to upgrade older schemas.

`CryptoHelper.decrypt` cascades:

1. v2 MK if unlocked.
2. **v1 fallback** if v2 is enabled but the blob fails — handles partial migrations and
   pre‑v2 records still on disk.
3. Plain `JSON.parse` as last resort — handles unencrypted test fixtures.

Source: `js/crypto-helper.js` lines 227–254.

---

## 3. Vault Lifecycle (passphrase, unlock, change, recover)

`window.VaultMeta` (`js/vault-meta.js`) is a thin async store holding:

```jsonc
{
  "passphraseSaltB64":      "…32-byte base64…",
  "passphraseWrappedMKB64": "…iv||AES-GCM(MK)…",
  "passphraseIterations":   600000,
  "recoverySaltB64":        "…or null…",
  "recoveryWrappedMKB64":   "…or null…",
  "recoveryIterations":     600000,
  "updatedAt":              "2026-05-07T…Z"
}
```

Phase 1c persists this to `localStorage[STORAGE_KEYS.VAULT_LOCAL_META]`. Phase 2 swaps
the implementation to read/write the `user_crypto_meta` table — the API stays
identical (all methods async).

UI driver: `js/vault-ui.js` (lines 1–468).

### 3.1 Onboarding (new vault)

1. User enters a passphrase (≥ 8 chars), confirms it.
2. `CryptoHelper.createVault(pass, 600_000)`:
   * Generates random 32 B MK.
   * Generates fresh 32 B `passphrase_salt`.
   * Derives KEK, wraps MK, returns metadata.
   * Caches MK in `_v2Key` so the user is immediately unlocked.
3. `CryptoHelper.generateRecoveryKey()` → `{ bytes, display }`.
4. `CryptoHelper.wrapWithRecoveryKey(bytes, 600_000)` produces `recoverySalt` + `recoveryWrappedMK`.
5. Step 2 of the modal shows the recovery key + a "Download" button. User must confirm
   they saved it before "Enable" is clickable.
6. `VaultMeta.save({...passphraseMeta, ...recoveryMeta})`.
7. `CryptoHelper.enableV2()` sets `localStorage[E2E_CRYPTO_V2] = '1'`.

### 3.2 Unlock (existing vault, new session)

`VaultUI.maybePromptUnlockOnLoad()` checks at boot: if v2 enabled, no `_v2Key` cached, and
metadata exists → show unlock modal.

`CryptoHelper.unlockVault(meta, passphrase)`:

1. PBKDF2 → KEK.
2. AES‑GCM‑decrypt `passphraseWrappedMKB64` → 32 B MK.
3. `crypto.subtle.importKey(... extractable: true)` → CryptoKey.
4. Cache in `_v2Key`. Zero temporary bytes. Return `true`.

Source: `js/crypto-helper.js` lines 317–331.

### 3.3 Change passphrase

User supplies current + new + confirm. `CryptoHelper.changePassphrase`:

1. Verify current passphrase by attempting to unwrap MK (fail → return null).
2. Call `rewrapWithPassphrase(new, iterations)`:
   * Export current in‑memory MK to bytes.
   * Generate **fresh** `passphrase_salt`.
   * Derive new KEK, wrap MK, return new metadata.
3. `VaultMeta.save(updated)`.

**Crucially**, the MK is unchanged. Every encrypted blob still decrypts. Only the wrapping
changes. This is why passphrase changes are effectively free.

Source: `js/crypto-helper.js` lines 345–385.

### 3.4 Forgot passphrase → Recovery flow

1. User pastes recovery key (whitespace/case/hyphen tolerant).
2. `CryptoHelper.unlockVaultWithRecoveryKey(meta, display)`:
   * Parse → 32 hex bytes.
   * Derive recovery KEK (PBKDF2 over the hex string + recovery_salt).
   * Unwrap MK from `recoveryWrappedMKB64`.
   * Cache in `_v2Key`.
3. User sets a new passphrase. `rewrapWithPassphrase` produces a fresh `passphrase_salt`
   and `passphrase_wrapped_mk`. The recovery wrap is left untouched (rotating it is a
   future option).

Source: `js/crypto-helper.js` lines 447–468.

### 3.5 Lock / Disable

* **Lock** (`CryptoHelper.lock`): nulls `_v2Key`. Encryption then fails until unlock.
  Decryption falls back to v1.
* **Disable v2** (vault‑ui "Disable" button): unsets the `E2E_CRYPTO_V2` flag, locks,
  wipes `VaultMeta`. Future writes encrypt under v1. Existing v2 ciphertext stays
  encrypted under MK and is unrecoverable until v2 is re‑enabled with the same vault.

---

## 4. Supabase Data Layer

### 4.1 Schema (`db/migrations/0001_initial_schema.sql`, `0002_wrapped_master_keys.sql`)

```sql
-- One row per (user, doc_key); ciphertext is opaque to the server.
create table public.user_blobs (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  doc_key     text        not null,
  ciphertext  text        not null,
  updated_at  timestamptz not null default now(),
  device_id   text,
  primary key (user_id, doc_key),
  constraint ciphertext_size check (length(ciphertext) <= 1048576)  -- 1 MB cap
);

-- One row per quote.
create table public.user_quotes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  ciphertext  text        not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint quote_ciphertext_size check (length(ciphertext) <= 1048576)
);
create index user_quotes_user_updated_idx on public.user_quotes (user_id, updated_at desc);

-- Per-user vault metadata. After 0002, holds the wrapped master keys.
create table public.user_crypto_meta (
  user_id               uuid        primary key references auth.users(id) on delete cascade,
  passphrase_salt       text        not null,            -- base64, 32 B
  passphrase_wrapped_mk text,                            -- base64( iv || AES-GCM(MK) )
  pbkdf2_iterations     int         not null default 600000,
  recovery_salt         text,                            -- base64, paired with recovery_wrapped_mk
  recovery_wrapped_mk   text,
  recovery_iterations   int         default 600000,
  recovery_key_hash     text,                            -- reserved
  created_at            timestamptz not null default now(),
  rotated_at            timestamptz,
  constraint salt_length check (length(passphrase_salt) between 32 and 128),
  constraint recovery_pair_consistency check (
    (recovery_salt is null     and recovery_wrapped_mk is null) or
    (recovery_salt is not null and recovery_wrapped_mk is not null)
  )
);

-- Append-only audit trail (no update/delete policies).
create table public.audit_log (
  id         bigserial   primary key,
  user_id    uuid        references auth.users(id),
  event_type text        not null,
  ip_address inet,
  user_agent text,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  constraint event_type_known check (event_type in (
    'login','login_failed','logout',
    'passphrase_set','passphrase_change','passphrase_reset_via_recovery_key',
    'recovery_key_exported','mfa_enrolled','mfa_disabled',
    'data_exported','account_deleted','sync_disabled','sync_enabled'
  ))
);
```

Triggers maintain `updated_at`:

```sql
create trigger user_blobs_set_updated_at
  before update on public.user_blobs
  for each row execute function public.tg_set_updated_at();
```

### 4.2 Row‑Level Security

Every table has RLS enabled. The principle is uniform:

```sql
create policy "own_blobs_select" on public.user_blobs
  for select using (auth.uid() = user_id);
create policy "own_blobs_insert" on public.user_blobs
  for insert with check (auth.uid() = user_id);
create policy "own_blobs_update" on public.user_blobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_blobs_delete" on public.user_blobs
  for delete using (auth.uid() = user_id);

create policy "own_quotes_all" on public.user_quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_crypto_meta_all" on public.user_crypto_meta
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- audit_log: select + insert only; no update/delete policy → Postgres rejects them.
create policy "own_audit_select" on public.audit_log for select using (auth.uid() = user_id);
create policy "audit_insert"     on public.audit_log for insert with check (auth.uid() = user_id);
```

Effect: a user with a valid JWT can only read/write rows where `user_id = auth.uid()`.
Cross‑user reads return zero rows (not an error). Admins do not have a SQL‑level override —
admin actions go through `api/admin-supabase.js` using the **service role key** (server only)
and are explicitly logged.

### 4.3 Sync API surface

`window.SupabaseSync` (`js/supabase-sync.js`):

* `pushBlob(docKey, ciphertext)` → `upsert(user_blobs, onConflict: 'user_id,doc_key')`.
* `pullBlob(docKey)` → `select('ciphertext, updated_at, device_id').eq('doc_key', …).maybeSingle()`.
* `deleteBlob(docKey)` → delete by composite PK.
* `pushQuote(quoteId, ciphertext)` / `pullQuote(id)` / `listQuotes()` / `deleteQuote(id)`.
* `schedulePush()` — debounced 3 s sweep that pushes every key in `DOC_LOCAL_KEYS`.
* `pushAllBlobs()` — used by the Phase 4 migration to push all blobs at once.

The server only ever sees opaque ciphertext. There is no `select * from user_blobs` flow
that returns anything plaintext, because plaintext doesn't exist server‑side.

### 4.4 Server config endpoint

`/api/config?type=supabase-public` returns:

```jsonc
{ "url": "https://<project>.supabase.co", "anonKey": "eyJ…" }
```

The anon key is safe to ship to browsers — without RLS it grants nothing, and RLS is
enabled on every user table. The **service role key** lives in server env (`SUPABASE_SERVICE_ROLE_KEY`)
and is only used by `api/admin-supabase.js` for admin endpoints.

---

## 5. MFA (TOTP)

### 5.1 Enrollment

`SupabaseAuth.enrollTOTP()` (`js/supabase-auth.js` lines 221–233) wraps
`client.auth.mfa.enroll({ factorType: 'totp' })` and returns:

```jsonc
{
  "factorId": "…",          // used for verify/unenroll
  "qrCode":   "data:image/svg+xml;…",   // SVG data URL for the QR
  "secret":   "JBSWY3DPEBLW64TMMQQ",     // base32 fallback for manual entry
  "uri":      "otpauth://totp/…"
}
```

The UI (`js/auth-mfa-ui.js`) renders the QR; the user scans it with Google
Authenticator, 1Password, Authy, etc.

### 5.2 Verification

```js
const challenge = await client.auth.mfa.challenge({ factorId });
const result    = await client.auth.mfa.verify({
  factorId,
  challengeId: challenge.data.id,
  code,                     // 6-digit code from the authenticator app
});
```

Supabase enforces TOTP code validity server‑side. On success the factor's status
becomes `'verified'`; we cache the factor list in memory and re‑check on every
auth state change (`_refreshFactors`).

Source: `js/supabase-auth.js` lines 235–252, 74–78.

### 5.3 Required vs Optional

```js
function mfaRequired() {
  if (!_user) return false;
  if (!_cloudSyncEnabled()) return false;   // local-only opt-out users are exempt
  return !_hasVerifiedTotp();
}
```

A user who turned cloud sync off (`STORAGE_KEYS.CLOUD_SYNC_DISABLED === 'true'`)
can use the app without enrolling — their data never leaves the device.

### 5.4 Soft → Hard escalation

Constants (`js/supabase-auth.js` lines 36–37):

```js
const MFA_HARD_ENFORCE_DISMISSES = 3;   // dismissals allowed
const MFA_HARD_ENFORCE_DAYS      = 14;  // grace window from first prompt
```

`mfaEnforcementLevel()` returns:

| Returns | Condition | Behavior |
|---------|-----------|----------|
| `null`  | MFA not required (no sync, or already verified) | Modal not shown |
| `'soft'` | Required but under both thresholds | Modal has a "Skip for now" button; dismissal increments `user_metadata.mfa_dismiss_count` and stamps `mfa_first_prompt_at` on first dismiss |
| `'hard'` | `dismiss_count ≥ 3` OR `days since first_prompt ≥ 14` | Modal cannot be dismissed; cloud sync stays gated until enrollment completes |

`recordMfaDismiss()` writes the counter via `client.auth.updateUser({ data: patch })`.
The data lives in `user_metadata` (user‑editable) — that's fine because escalation only
*tightens* over time; a user blanking it would just put themselves back in `'soft'` mode
and immediately incur the same prompt anyway.

### 5.5 Sync‑level enforcement

`js/sync-facade.js` lines 50–123 wraps every **write** in a guard:

```js
function mfaBlocksSync() {
  if (backend() !== 'supabase') return false;
  return window.SupabaseAuth?.mfaRequired() ?? false;
}
function writeBlocked() { return mfaBlocksSync() || policyBlocksSync(); }

window.Sync = {
  schedulePush(...a) { if (writeBlocked()) return undefined; return call('schedulePush', a); },
  pushBlob(...a)     { if (writeBlocked()) return Promise.resolve({ ok:false, skipped:'mfa-required' });
                       return callSupabase('pushBlob', a); },
  pushQuote(...a)    { if (writeBlocked()) return Promise.resolve({ ok:false, skipped:'mfa-required' });
                       return callSupabase('pushQuote', a); },
  // …deleteBlob, deleteQuote, fullSync similarly gated.

  // Reads stay open so the migration flow can pull pre-MFA data.
  pullBlob(...a)   { return callSupabase('pullBlob', a); },
  pullQuote(...a)  { return callSupabase('pullQuote', a); },
  listQuotes(...a) { return callSupabase('listQuotes', a); },
};
```

So an unenrolled user can still load their data, but every push is silently dropped at
the facade until they verify a TOTP factor.

### 5.6 admin / blocked semantics

`is_admin` and `is_blocked` live in `user.app_metadata` — Supabase only allows the
**service role** to write app_metadata, so a malicious client cannot promote itself.
`api/admin-supabase.js` uses a dual‑client pattern:

1. `getCallerClient(accessToken)` — bound to the caller's JWT, used to verify admin status.
2. `getServiceRoleClient()` — bypasses RLS, used to mutate other users' app_metadata.

Every admin write is logged to `audit_log` (and `console.log` for the request id).

---

## 6. Backend Routing — `Sync` and `AuthFacade`

The codebase still ships Firebase + Supabase side by side. `js/sync-facade.js` chooses
at runtime based on `STORAGE_KEYS.SYNC_BACKEND`:

```js
function backend() {
  return localStorage.getItem(STORAGE_KEYS.SYNC_BACKEND) === 'supabase'
    ? 'supabase' : 'firebase';
}
```

Prefer the facades in new code:

| Use | Not |
|-----|-----|
| `window.Sync.*` | `CloudSync.*` (Firebase direct) |
| `window.AuthFacade.*` | `Auth.*` / `SupabaseAuth.*` directly |

`AuthFacade` mirrors the routing for sign‑in, sign‑up, logout, `apiFetch` (Bearer token
injection), and `onAuthStateChange` listeners.

To add a new synced doc:

1. Add a constant in `js/storage-keys.js`.
2. Add an entry in `DOC_LOCAL_KEYS` (`js/supabase-sync.js` lines 32–45).
3. Add the doc name to `SYNC_DOCS` in `js/cloud-sync.js` so the Firebase side picks it up too.

That's it — push/pull/delete are generic.

---

## 7. Phase 4 Migration: Firebase → Supabase E2E

The flag flip from `firebase` → `supabase` triggers a one‑time per‑user migration:

1. **Pre‑flight.** User signs in (either backend). Confirm v2 vault exists locally
   (`VaultMeta.exists()`); if not, run onboarding (§3.1) so MK is generated.
2. **Server vault.** POST `passphrase_salt`, `passphrase_wrapped_mk`, optionally
   `recovery_salt` / `recovery_wrapped_mk`, and `pbkdf2_iterations` to the server
   endpoint that upserts `user_crypto_meta`.
3. **Re‑encrypt.** For each `(docKey, lsKey)` in `DOC_LOCAL_KEYS`:
   * Read local ciphertext (still encrypted under v1 device key, or already v2).
   * Decrypt → re‑encrypt under MK → push via `pushBlob(docKey, ciphertext)`.
   * Same loop for quotes via `pushQuote`.
4. **MFA enrollment.** If `SupabaseAuth.mfaRequired()` is `true`, run the TOTP enroll +
   verify modal (`js/auth-mfa-ui.js`). Soft mode lets users defer up to 3 times or 14 days.
5. **Flip the flag.** `localStorage[STORAGE_KEYS.SYNC_BACKEND] = 'supabase'`.
   `Sync` and `AuthFacade` immediately route to Supabase.
6. **Steady state.** Saves encrypt under MK, push debounced 3 s. Cross‑device sync reads
   from `user_blobs` / `user_quotes`. Every push is gated on a verified TOTP factor.

Backwards compatibility notes:

* `CryptoHelper.decrypt` falls back from v2 → v1 → plain JSON, so partial migrations
  don't lose data.
* `App.load` parks any blob it can't decrypt in `STORAGE_KEYS.DECRYPTION_RECOVERY` (FIFO,
  20 entries) so the user can recover with their recovery key later.

---

## 8. Threat Model (summary)

| Threat | Mitigation |
|--------|-----------|
| Stolen device, browser open | Active session has unwrapped MK in memory; lock + auto‑lock recommended |
| Stolen device, browser closed | Passphrase needed to unwrap MK. Offline brute force costs 600k PBKDF2 iterations × guess. |
| Phishing → password compromise | TOTP MFA mandatory for cloud sync writes; soft → hard escalation |
| Malicious DBA / supabase staff | Server only sees ciphertext, salts, RLS metadata. Master key never leaves the client unwrapped. |
| MITM | TLS by Supabase. AES‑GCM auth tag detects tampering. |
| User loses passphrase | Recovery key → unwrap MK → set new passphrase. No data loss. |
| User loses passphrase **and** recovery key | Data is unrecoverable. This is the price of true E2E. |
| Admin escalation by client | `is_admin` lives in `app_metadata`; only the service role key (server‑only) can mutate it. |
| Cross‑user data read | RLS: `auth.uid() = user_id` on every policy. Cross‑user queries return zero rows. |

---

## 9. Operational Reference

### 9.1 LocalStorage keys (encryption‑related)

```text
altech_encryption_salt        v1 device salt (NEVER sync)
altech_e2e_crypto_v2          '1' = v2 active, anything else = v1
altech_vault_meta_local       VaultMeta stub (Phase 1c)
altech_sync_backend           'firebase' (default) | 'supabase'
altech_cloud_sync_disabled    'true' = local-only mode (MFA exempt)
altech_decryption_recovery    Parked ciphertexts (FIFO, max 20)
altech_device_id              dev_<base36-ts>_<6-rand-chars>
```

Source: `js/storage-keys.js`.

### 9.2 PBKDF2 parameters

| Use | Iterations | Hash | Output |
|-----|-----------|------|--------|
| v1 device key | 100,000 | SHA‑256 | 256‑bit AES‑GCM key |
| v2 passphrase KEK | 600,000 (configurable per vault) | SHA‑256 | 256‑bit AES‑GCM key |
| v2 recovery KEK | 600,000 | SHA‑256 | 256‑bit AES‑GCM key |

### 9.3 IV / nonce

* 12 bytes from `crypto.getRandomValues`, fresh per encryption.
* Prepended to ciphertext before base64 encoding.
* GCM auth tag is appended automatically by `crypto.subtle.encrypt`.

### 9.4 File map

| File | Role |
|------|------|
| `js/crypto-helper.js` | All AES‑GCM / PBKDF2 / wrap / unwrap primitives (v1 + v2) |
| `js/vault-meta.js` | Async key‑value store for passphrase/recovery wrapped MK + salts |
| `js/vault-ui.js` | Onboarding, unlock, change‑passphrase, recover modals |
| `js/storage-keys.js` | Frozen registry of every `altech_*` localStorage key |
| `js/supabase-config.js` | Loads anon key + URL via `/api/config?type=supabase-public` |
| `js/supabase-auth.js` | Email/password auth, TOTP enroll/verify, factor caching, MFA gating |
| `js/auth-mfa-ui.js` | TOTP modal: QR display, 6‑digit verify, soft/hard dismiss |
| `js/supabase-sync.js` | `user_blobs` / `user_quotes` push/pull/delete, debounced sweep |
| `js/sync-facade.js` | `window.Sync` + `window.AuthFacade`; backend routing + MFA gate |
| `js/cloud-sync.js` | Firebase parallel implementation (legacy path) |
| `js/auth.js` | Firebase auth (legacy path) |
| `js/app-core.js` | `App.save` / `App.load` — encryption integration + recovery bucket |
| `api/admin-supabase.js` | Server‑side admin endpoints (service‑role, dual‑client pattern) |
| `db/migrations/0001_initial_schema.sql` | Tables, RLS, triggers |
| `db/migrations/0002_wrapped_master_keys.sql` | Adds wrapped MK columns + recovery pair constraint |

---

## 10. What NOT to Do

* **Don't** sync `ENCRYPTION_SALT`, `PASSPHRASE_SALT`, or `*_RECOVERY` keys to the cloud.
* **Don't** read or write `STORAGE_KEYS.FORM` (`altech_v6`) directly — go through `App.save` / `App.load`.
* **Don't** call `CloudSync.*` or `SupabaseSync.*` directly in new code — use `window.Sync.*`.
* **Don't** lower PBKDF2 iterations below 600,000 for v2; OWASP 2023 floor.
* **Don't** reuse IVs. Always `crypto.getRandomValues(new Uint8Array(12))` per encryption.
* **Don't** put plaintext in `user_blobs` / `user_quotes`. The server is assumed hostile.
* **Don't** edit `app_metadata` from the client. Use `api/admin-supabase.js` with the service role key.
* **Don't** drop a row that fails to decrypt. Park it in `DECRYPTION_RECOVERY` so the user
  can recover later.
