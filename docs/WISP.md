# Written Information Security Program (WISP)

**Covered entity:** Altech Toolkit (internal application used by the insurance agency's producers).
**Document owner / Qualified Individual:** Austin Kays (austinkays@gmail.com).
**Adopted:** April 17, 2026.
**Review cadence:** Annual, next review by April 17, 2027.
**Regulatory basis:** FTC Safeguards Rule (16 CFR Part 314, 2023 revision), NAIC Insurance Data Security Model Law, WA OIC adopted sections, GLBA Privacy Rule.

---

## 1. Purpose

The Altech Toolkit stores client Nonpublic Personal Information (NPI) collected during insurance intake and quoting — names, DOBs, addresses, contact information, driver history, vehicle identifiers, property details. This document states how Altech protects that information, who is responsible, and how we respond when something goes wrong.

This WISP is binding on anyone with access to the toolkit's production data.

---

## 2. Scope

Systems in scope:

- The Altech web application (hosted on Vercel at `altech.vercel.app` / custom domain).
- Backing data stores: Supabase (primary, Phase 1 onward) and Firebase Firestore (legacy, read-only after migration, purged at T+90 days).
- Vercel serverless functions in `api/*`.
- All source code in `github.com/austinkays/Altech`.
- Any laptop, desktop, or mobile device used by an agency user to access the toolkit.

Systems out of scope:

- The agency's policy-management system (EZLynx, HawkSoft) — governed by its vendor's security program.
- Personal email accounts used by users for agency business — covered by agency-wide acceptable-use policy (not this document).

---

## 3. Qualified Individual

Austin Kays is designated the Qualified Individual responsible for overseeing, implementing, and enforcing this WISP. Duties:

- Review this document annually.
- Review the Risk Assessment (§5) annually.
- Maintain the vendor list (§8) and confirm current DPAs.
- Investigate security incidents (§10).
- Provide a written status report to agency leadership annually.

If the Qualified Individual changes, this document must be updated within 30 days.

---

## 4. Roles and Access

| Role | Who | Access |
|---|---|---|
| Qualified Individual | Austin Kays | All application data, all infrastructure dashboards |
| Agency users (producers) | Up to 5 named individuals | Only their own client data (enforced by Supabase Row Level Security) |
| Vendor support | Supabase support, Vercel support | No access to application data; support scoped to infrastructure |

Access control principles:

- Every user has an individual account. No shared accounts. No shared passwords.
- Every account requires MFA (TOTP) before cloud sync can be enabled (Phase 3 onward).
- Accounts are disabled within 24 hours of a user leaving the agency.
- The service-role key that bypasses RLS is stored only in Vercel environment variables, never in source code, and is used only by server-side cron jobs.

---

## 5. Risk Assessment (summary)

Full risk register maintained separately. High-priority risks as of April 17, 2026:

| Risk | Likelihood | Impact | Control |
|---|---|---|---|
| Credential compromise of a user account via phishing | Medium | High | MFA (Phase 3+). Until then, sign-in warning banner + cloud-sync opt-out. |
| Backend data breach (Supabase / Firebase compromised) | Low | High (legacy) / Low (post-Phase 2) | Path B: ciphertext-only at rest. Until Phase 2 ships, minimize cloud data via opt-out. |
| Laptop theft with browser open | Medium | Medium | Browser data is AES-256-GCM encrypted with PBKDF2 (currently device-bound; Phase 1 moves to passphrase-bound). |
| Data sent to third-party AI (Gemini) | Medium | Medium | Driver's license image scan removed April 17, 2026. Non-NPI fetches (property lookups, address enrichment) remain. Move to Vertex AI (DPA-covered) is planned. |
| Accidental commit of secrets to GitHub | Low | High | `.gitignore` covers `.env*`. Secret-scanning enabled on the repo. |
| Stale accounts after offboarding | Medium | Medium | §4: 24-hour deactivation SLA. |

---

## 6. Technical Controls

### 6.1 Encryption

- **In transit:** TLS 1.3 enforced by Vercel and Supabase. No plaintext HTTP.
- **At rest (legacy, Firebase):** Firestore disk-level encryption by Google. Application-layer plaintext. **This is why we are migrating.**
- **At rest (Path B, Supabase):** Application-layer AES-256-GCM. Keys derived from user passphrase via PBKDF2 (600,000 iterations, SHA-256). Keys never leave the user's browser. Salt per-user, stored in Supabase. See `js/crypto-helper.js` and `db/migrations/0001_initial_schema.sql`.
- **Local storage:** Browser `localStorage` data encrypted with the same key. Browser cache clears → no residual plaintext.

### 6.2 Authentication

- Email + password on Supabase Auth (Phase 3+).
- Passwords hashed with Supabase's default (bcrypt, ≥10 rounds).
- Mandatory TOTP MFA for any account with cloud sync enabled.
- Password reset requires email verification.
- Idle session timeout: 24 hours (configurable in Supabase dashboard).

### 6.3 Authorization

- Supabase Row Level Security: every table includes `auth.uid() = user_id` policies. An authenticated user can read and write only their own rows. Cross-user access returns zero rows or 403.
- Admin operations (invite user, deactivate user, view audit log) run through a dedicated `/api/admin/*` path that validates the caller's `is_admin` metadata before using the service-role key.

### 6.4 Logging and Monitoring

- Vercel function logs retained 30 days (longer available on paid tier).
- Supabase Postgres audit log via `pgaudit` extension (Phase 6).
- Application-level audit log in `public.audit_log` — append-only. Events: login, passphrase change, recovery key usage, data export, account delete.
- Daily automated review of failed login attempts once the user count grows past 10; manual for now.

### 6.5 Change Management

- All production changes deploy through GitHub → Vercel.
- No direct database writes to production Supabase. Schema changes go through `db/migrations/*.sql` and are version-controlled.
- Breaking changes to the security model (auth, crypto, RLS) require review by the Qualified Individual before merge.

### 6.6 Secure Disposal

- When a user is offboarded: account deactivated within 24 hours. Data retained per §7.
- When a client relationship ends: data archived after 2 years of inactivity, hard-deleted at 7 years (insurance industry retention norm).
- Any backup older than 90 days is destroyed unless under legal hold.

---

## 7. Data Retention

| Data type | Retention | Disposal |
|---|---|---|
| Active client quotes / forms | Until client closed + 7 years | Hard delete from Supabase + any backup |
| Inactive user accounts | 90 days after deactivation | Hard delete, including all audit records tied only to that user |
| Audit log entries | 7 years | Hard delete |
| Vercel function logs | 30 days | Provider-managed auto-rotation |
| Firebase data (legacy) | 90 days after Phase 4 cutover | Hard delete via admin script |

---

## 8. Vendor Oversight

Every third party with potential access to NPI must have a signed Data Processing Agreement (DPA) or equivalent contractual protection.

| Vendor | Role | DPA status | Notes |
|---|---|---|---|
| Supabase (Supabase Inc.) | Primary datastore + auth (Phase 1+) | **To sign (Phase 0 deliverable)** | US-hosted project. SOC 2 Type II. |
| Vercel | Application hosting | **To confirm / sign** | Standard DPA available via dashboard. |
| Google Cloud (Firebase) | Legacy datastore until Phase 4 | To confirm (Google Cloud DPA) | Will be decommissioned per §7. |
| Google AI (Gemini consumer API) | Property/owner name lookups | **Limited NPI exposure.** Migrating to Vertex AI or removing. | Owner name + property address sent for enrichment; no client intake NPI. |
| GitHub | Source code hosting | N/A (no production data) | — |
| Anthropic (Claude API) | Optional agent features | **To confirm** | Only user-controlled text inputs; not client intake data. |
| OpenAI / OpenRouter | Optional agent features | **To confirm** | Same as above. |

Reviewed annually or on any change of critical vendor.

---

## 9. User Training

Every user is required to:

- Acknowledge this WISP before their first login.
- Complete a 15-minute privacy/security orientation covering: what NPI is, why passwords are not shared, how to report an incident, what the recovery key is and where to store it.
- Re-acknowledge annually.

Training materials live in `docs/user-training.md` (to be created).

---

## 10. Incident Response

See `docs/incident-response.md` for the full runbook. Summary:

1. **Detect** — user, QI, or vendor notifies the Qualified Individual.
2. **Contain** — revoke credentials, rotate keys, isolate affected systems within 2 hours.
3. **Assess** — determine scope of exposure (which users, which data) within 24 hours.
4. **Notify** — affected clients within 30 days, WA OIC within 72 hours if the incident meets the NAIC Model Law threshold, E&O carrier per policy.
5. **Remediate** — fix root cause, update this WISP if needed.
6. **Document** — incident written up, archived permanently.

---

## 11. Annual Review

Every April, the Qualified Individual shall:

- [ ] Re-read this document end-to-end; correct anything that drifted.
- [ ] Re-run the risk assessment (§5).
- [ ] Confirm each vendor DPA is still current (§8).
- [ ] Review the full audit log for anomalies.
- [ ] Walk through the incident response runbook as a tabletop exercise.
- [ ] Deliver a one-page status report to agency leadership.
- [ ] Confirm all users have completed annual re-acknowledgement (§9).
- [ ] Replace any vendor who has had a material security incident without a credible remediation.

Changes require update of the "Adopted" and "Review" dates above.

---

## Appendix A — Safeguards Rule (2023) compliance map

| Safeguards Rule requirement | Where addressed |
|---|---|
| Designate Qualified Individual | §3 |
| Written risk assessment, reviewed annually | §5 + §11 |
| Access controls, least privilege, unique credentials | §4, §6.3 |
| Encryption of customer info at rest AND in transit | §6.1 |
| Multi-factor authentication | §6.2 |
| Secure disposal when no longer needed | §6.6, §7 |
| Change management log | §6.5 + git history |
| Monitoring and logging of authorized user activity | §6.4 |
| Vendor oversight with contractual obligations | §8 |
| Written incident response plan | §10 + `docs/incident-response.md` |
| Annual training for staff with access | §9 |
| Annual written report to leadership | §11 |

All 12 items addressed.
