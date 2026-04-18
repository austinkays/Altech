# Incident Response Runbook — Altech Toolkit

**Companion to:** `docs/WISP.md` §10.
**Owner:** Austin Kays (Qualified Individual).
**Tabletop exercise cadence:** Annual, same April review window as the WISP.

---

## Contacts

Keep this list current. Verify every contact at each annual review.

| Role | Name | Reach |
|---|---|---|
| Qualified Individual | Austin Kays | austinkays@gmail.com, cell on file with agency |
| Agency principal / decision maker | (the boss) | — |
| E&O carrier | (agency's carrier) | Claim reporting number on file |
| Supabase support | support@supabase.com | Dashboard → Support |
| Vercel support | support@vercel.com | Dashboard → Support |
| Google Cloud (Firebase) | — | via Cloud Console while legacy system is active |
| Outside counsel | (optional, if retained) | — |
| WA Office of the Insurance Commissioner | complaints@oic.wa.gov / 360-725-7080 | NAIC Model Law 72-hour notification |
| WA Attorney General — breach notification | 800-551-4636 / agbreach@atg.wa.gov | State breach notification law |
| FBI Internet Crime Complaint Center | ic3.gov | For suspected external attack |

---

## What counts as an incident

Treat any of the following as an incident and trigger the runbook:

- A user reports suspicious activity on their account they can't explain.
- A password or recovery key is shared outside the agency (even accidentally).
- A device with the app logged in is lost, stolen, or sold.
- Source code changes appear in the repo that weren't made by an authorized committer.
- A vendor notifies us of a security incident affecting their platform.
- Application logs show a pattern of failed logins, unexpected traffic, or access from an unfamiliar IP/country.
- A production secret (Supabase service-role key, Firebase admin key, Stripe key, Gemini key) is exposed in a commit, log, screenshot, or message.
- A client reports receiving data that wasn't theirs.

When in doubt, page the Qualified Individual. False positives are cheap; missed incidents are not.

---

## Phase 1 — Detect and declare (minutes)

1. Whoever notices the issue pages the Qualified Individual (QI) immediately by any available channel.
2. QI acknowledges and opens a new file in `/incidents/YYYY-MM-DD-<shortname>.md` (private repo or local — this log is not shared until resolved).
3. Record: what was seen, when, by whom, on what device/URL, screenshots/IDs if any.
4. Assign an incident number (`INC-YYYY-NN`).

If the issue is obviously critical (active attack, confirmed breach, leaked credentials), proceed to Phase 2 in parallel with step 2.

---

## Phase 2 — Contain (≤ 2 hours)

Pick from the following based on what the incident looks like. Over-containment is better than under-containment.

| Scenario | Action |
|---|---|
| Credential compromise (single user) | Force sign-out via Supabase dashboard → Users → Revoke session. Force password reset. Disable MFA and re-enroll. |
| Credential compromise (QI or admin) | Also rotate every service-role key and every Vercel env secret. Redeploy. |
| Service-role key or Gemini/Stripe key exposed | Rotate the key in the source dashboard, update Vercel env var, redeploy, push a commit that removes any trace of the key from history (`git filter-repo` or BFG). File a GitHub secret-scanning report. |
| Stolen device with the app open | Force sign-out the user's sessions. If the device held the passphrase (e.g., in a password manager that synced to it), prompt the user to change their passphrase — this triggers the re-encryption flow. |
| Backend (Supabase / Firebase) incident per vendor notice | Read the vendor's notice carefully. Determine whether our data was affected. If any Path A / legacy plaintext data was in scope, treat as an NPI disclosure. If only Path B ciphertext, low risk — proceed with assessment only. |
| Suspicious source code change | Revert the commit. Force-push a clean main after review by QI + one other committer. Enable branch protection if not already. |
| Active attack pattern in logs | Put Vercel into maintenance mode (set a deployment-protection password or take the custom domain offline). Investigate before re-opening. |

Document every action taken in the incident file with a timestamp.

---

## Phase 3 — Assess (≤ 24 hours)

Answer these questions in writing:

- **What data was exposed?** Specifically: whose names, whose DOBs, whose DLs, whose addresses. Be exact. If uncertain, list the upper bound.
- **How many unique clients are affected?**
- **Was any affected data plaintext?** (Firebase legacy data: yes. Path B Supabase ciphertext: no, unless the user's passphrase was also compromised.)
- **Was any data actually exfiltrated, or only accessible?** Logs, netflow, bucket access records — find evidence either way.
- **Is the root cause understood?**
- **Is the containment effective, or could it recur?**

If the answer to "how many clients" is ≥1, move to Phase 4.

---

## Phase 4 — Notify (within deadlines)

| Party | Deadline | Required content |
|---|---|---|
| WA OIC (if NAIC Model Law applies) | 72 hours from determination | Incident description, # affected WA residents, what data types, containment, expected notice date to consumers |
| Affected clients (WA state breach law) | Within 30 days, sooner if possible | What happened, what data was exposed, what you're doing about it, free credit monitoring if SSN/financial account exposed, how to reach you |
| WA AG | If > 500 WA residents affected | Same template as consumer notice, plus number affected |
| E&O carrier | Per policy — usually ASAP | Per policy reporting requirements |
| Agency leadership | Same day as determination | Summary + proposed response |
| Affected users of Altech | Same day | What we know and what they need to do |

Template letters live in `docs/breach-notice-templates/` (create as needed — we have no templates yet; draft one the first time we need it and save it).

**Do not over-notify.** If only Path B ciphertext was accessible and no passphrase compromise is known, the event likely does not meet the breach threshold — document the reasoning before deciding not to notify.

---

## Phase 5 — Remediate (within 30 days)

- Patch the root cause. Not a workaround — the actual cause.
- If the incident exposed a weakness in the WISP, update `docs/WISP.md` and the risk register.
- If the incident exposed a weakness in this runbook, update this document.
- Close the incident file: `CLOSED YYYY-MM-DD — <one-line summary>`.

---

## Phase 6 — Post-mortem (within 60 days)

Write a blameless post-mortem covering:

- Timeline: detection → containment → assessment → notification → closure.
- What went well.
- What didn't.
- Five concrete actions to prevent recurrence, each with an owner and due date.

Store in `docs/incidents/<INC-ID>-postmortem.md`. Share with agency leadership. If it rises to the level of a reportable event, keep it as part of the permanent record.

---

## Tabletop exercise

Once a year, walk through a realistic scenario end-to-end without touching production. Example scenarios to rotate through:

- A user texts you that they signed in on a borrowed laptop and forgot to sign out.
- GitHub emails the QI that a service-role key was found in a public commit.
- Supabase emails saying a sub-processor had a security incident affecting certain projects.
- A client emails saying they received a quote PDF that wasn't for them.

For each, answer the six phases in writing with realistic timing. File the result in `docs/incidents/tabletop-YYYY.md`.
