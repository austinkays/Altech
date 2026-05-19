# HawkSoft API Bible — Agent Reference

> **Authoritative reference** for all HawkSoft API usage in Altech.
> Last updated: May 2026. Based on the production HawkSoft 6 integration plus a
> DevTools exploration of HawkSoft 6's internal web architecture.

---

## Two Integration Paths

| Path | Endpoint | Auth | Sanctioned? | Wired today? |
|------|----------|------|-------------|--------------|
| **A — Partner API** | `integration.hawksoft.app` | HTTP Basic (agency credentials) | ✅ Yes — official | ✅ Yes — the live logger |
| **B — Internal API** | `cs.hawksoft.app` | Ambient session cookies (browser) | ❌ No — undocumented, gray-area TOS | ❌ No — foundation only |

> ### ✅ VERIFIED 2026-05-18 — Path A renders the HTML dialect
>
> The exploration guide claimed the partner API is plain-text only. **This is
> false.** A `buildHawkSoftNote()` payload was pushed through the sanctioned
> partner API (`api/hawksoft-logger.js` → `integration.hawksoft.app`,
> "Confirm & Push") and HawkSoft rendered it correctly — **bold, numbered
> list, `rgb()` color, underline, and the Phone › From › Insured channel**
> all came through (production log **Row #234**). **Path B is therefore NOT
> required for rich formatting** — the sanctioned, already-wired path does it.
> Path B remains relevant only for *real-user attribution* (Path A still logs
> as the generic integration user).

**Why both still matter:** Path A (sanctioned) now covers formatting **and**
channels — its only remaining gap is `created_by` attribution (logs show the
generic integration user; the logger works around this by prefixing agent
initials to the `RE:` line). Path B (internal `cs.hawksoft.app`, undocumented/
unsanctioned) would add true per-user attribution but is **not wired** and
needs a live session + test client to verify. The formatting win is shipped on
Path A; Path B is now a lower-priority attribution-only follow-up.

---

## Path A — Partner API (SANCTIONED · LIVE)

The "HawkSoft Logger" the agency uses today.

| Concern | Detail |
|---------|--------|
| Files | [`api/hawksoft-logger.js`](../api/hawksoft-logger.js) · [`js/call-logger.js`](../js/call-logger.js) · [`plugins/call-logger.html`](../plugins/call-logger.html) |
| Endpoint | `POST https://integration.hawksoft.app/vendor/agency/{agencyId}/client/{clientId}/log?version=3.0` |
| Auth | `Authorization: Basic base64(HAWKSOFT_CLIENT_ID:HAWKSOFT_CLIENT_SECRET)` — env vars; `HAWKSOFT_AGENCY_ID` in the URL |
| Flow | Two-step: `formatOnly:true` (AI cleans shorthand → preview) → confirm (`formattedLog` pushed) |
| Attribution | Generic integration user. Worked around by prepending **agent initials to the `RE:` line** so the truncated log-list view still identifies the agent. |
| Note format | **HTML (verified).** The AI still emits plain text; on Confirm & Push `js/call-logger.js` `_plainToHawkSoftHtml()` deterministically converts it via `buildHawkSoftNote()` and pushes the HTML through this same API. Line 1 is kept a plain `<div>` (no spans) so the collapsed log-list stays clean; body gets reliable paragraph breaks, bolded `Action:`, and real `<ul>/<ol>`. Falls back to plain text if the builder is unavailable. |

**Request body** (`api/hawksoft-logger.js` `_pushToHawkSoft`):

```jsonc
{
  "refId":     "<uuid>",
  "ts":        "<ISO 8601>",
  "note":      "<plain text>",
  "channel":   5,            // LogAction enum 1-56
  "method":    "Phone",
  "direction": "From",
  "party":     "Insured",
  "policyId":  "<optional HawkSoft policy id>"
}
```

> ### ⚠️ Correction to the HawkSoft 6 exploration guide
>
> The guide states Path A *"cannot set proper activity channels (Phone,
> Walk-in, Email…) or directions."* **This is outdated.** The partner API
> request body already accepts `channel` / `method` / `direction` / `party`,
> and the logger has set them since the v3.0 integration — see `CHANNEL_MAP`
> in [`api/hawksoft-logger.js`](../api/hawksoft-logger.js) (the `Inbound /
> Outbound / Walk-In / Email / Text / Mail` map). The real remaining Path-A
> gaps are **(1) HTML formatting** and **(2) real `created_by` attribution** —
> nothing else.

Channel enum and the `callType` map are catalogued in
[`hawksoft-dictionary.json`](hawksoft-dictionary.json) under `pathA_partnerApi`
(the **code is the source of truth**; the JSON mirrors it).

---

## Path B — Internal API via the extension (UNSANCTIONED · NOT WIRED)

From the HawkSoft 6 DevTools exploration. Documented here so the context
survives, but **no code calls it.** It would route writes through the Altech
Field Lead Chrome extension running in the `hawksoft.app` browser context,
using the user's ambient session cookies (`credentials: 'include'` — the token
values are never read or transmitted).

- `POST https://cs.hawksoft.app/api/client/{clientId}/log` — create log
- `GET https://cs.hawksoft.app/api/client/{clientId}` — full client load
- `GET https://agencyapi.hawksoft.app/agency/settings/list/options` — code/tag dictionary

Confirmed channel/direction/action codes (only 4 of ~8-10 channels, 1 action)
are in [`hawksoft-dictionary.json`](hawksoft-dictionary.json) under
`pathB_internalApi`; **every unknown is the literal `"TBD"`** — nothing is
guessed. Filling them requires a live HawkSoft session against a designated
**test client** ("TEST CLIENT — DO NOT USE"); never use real client data.

---

## Note HTML Dialect

HawkSoft accepts HTML in the note field, but only the specific dialect its
contentEditable produces. **Semantic tags (`<strong>`, `<em>`, `<p>`) are
stripped.** [`js/hawksoft-note.js`](../js/hawksoft-note.js) `buildHawkSoftNote()`
is the single source of truth — it converts a structured intermediate
representation (IR) into this dialect so that if HawkSoft changes its format,
only that one function changes.

| Formatting | Output |
|---|---|
| Bold | `<span style="font-weight: bold;">…</span>` |
| Italic | `<span style="font-style: italic;">…</span>` |
| Underline | `<span style="text-decoration-line: underline;">…</span>` |
| Color | `<span style="color: rgb(R, G, B);">…</span>` |
| Combined | one span, fixed order: weight → style → decoration → color |
| Paragraph | `<div>…</div>` (never `<p>`) |
| Empty line | `<div><br></div>` |
| Bullet / numbered | `<ul><li>…</li></ul>` / `<ol><li>…</li></ol>` |
| Link | `<a target="_blank" href="https://…">…</a>` |

**IR shape** (`NoteContent = NoteBlock[]`): blocks are `paragraph {runs}`,
`bullet {items}`, `numbered {items}`, `break`; runs are
`text {text, bold?, italic?, underline?, color?[r,g,b]}` or `link {text, href}`.

**Security model** (the builder is the trust boundary — its output is POSTed to
HawkSoft and rendered there):

- All run text is HTML-escaped via `Utils.escapeHTML`; non-string text → `''`.
- Link `href` is control-char-stripped, scheme-allowlisted (`http:`/`https:`/
  `mailto:` only — `javascript:`/`data:`/`vbscript:`/relative degrade to inert
  escaped text, never an `<a>`), then attribute-escaped via `Utils.escapeAttr`.
- Colors are validated/rounded/clamped to `[0,255]`; any invalid component
  drops the whole color. The style string is built only from literal property
  names + validated integers — never attacker-controllable.
- Unknown block/run types and typeless objects are skipped (no fall-through).
- `\n` inside text is kept literal — the IR owns layout via `break` /
  `paragraph`; HawkSoft collapses raw newlines (consistent with the existing
  Path-A system prompt).

---

## Response Codes

Surface API failures through `HawkSoftNote.HawkSoftAPIError(status, body)`
([`js/hawksoft-note.js`](../js/hawksoft-note.js)):

| Status | Getter | Meaning / action |
|--------|--------|------------------|
| 401 / 403 | `isAuthError` | Session/credentials invalid — re-auth (Path B: user must re-log into HawkSoft) |
| 404 | `isNotFound` | Client/policy id wrong |
| ≥ 500 | `isServerError` | HawkSoft-side failure — retry/fallback |
| other | — | Inspect `.body` |

`isServerError` is guarded to require a numeric status, so a non-numeric
status yields `false` rather than throwing.

---

## Status & Roadmap

### Done — shipped

- [x] `buildHawkSoftNote()` IR → HawkSoft-HTML builder — [`js/hawksoft-note.js`](../js/hawksoft-note.js)
- [x] `HawkSoftAPIError` with `isAuthError` / `isNotFound` / `isServerError`
- [x] ~70-case unit suite — [`tests/hawksoft-note.test.js`](../tests/hawksoft-note.test.js) (XSS, scheme rejection, color clamp, degenerate inputs, error truth table)
- [x] [`hawksoft-dictionary.json`](hawksoft-dictionary.json) — Path A code-mirror + Path B confirmed-vs-`TBD`
- [x] DRY-RUN preview panel in the HawkSoft Logger (presets → IR → HTML + live render)
- [x] **VERIFIED Path A renders the HTML dialect in production** (log Row #234) — the "plain-text only" assumption is disproven
- [x] **Wired into the live logger**: `_plainToHawkSoftHtml()` converts the reviewed plain text → `buildHawkSoftNote()` HTML on Confirm & Push, list-view-safe (plain line 1), human-gated, plain-text fallback — [`js/call-logger.js`](../js/call-logger.js), [`tests/call-logger-html-format.test.js`](../tests/call-logger-html-format.test.js)

### Next — richer formatting (Path A, sanctioned, lower risk)

- [ ] Let the AI emit structured `NoteContent` (or richer markers) so key figures/quote numbers can be bolded/colored — currently the converter is deliberately conservative (structure + `Action:` + lists only)
- [ ] Sanity-check the **collapsed log-LIST** view on real pushes (opened view verified; list view kept plain-line-1 as mitigation)

### Pending — Path B (now ATTRIBUTION-ONLY, lower priority)

Formatting no longer needs Path B. Path B is only worth pursuing for true
`created_by` per-user attribution (Path A logs as the generic integration
user). Still requires a live HawkSoft session + designated test client:

- [ ] Capture the real `cs.hawksoft.app` create-log request/response shape + missing channel/action codes + the agency options dictionary
- [ ] Extension manifest `host_permissions` + HawkSoft bridge/content script + `createHawkSoftLog()` (ambient-cookie `fetch`) for attribution
- [ ] Kill switch + response-shape watchdog for internal-API drift
- [ ] A Node-safe `escapeHTML` if the builder is ever called server-side (it currently needs a DOM via `Utils.escapeHTML`)
- [ ] Decide whether multi-line text runs should auto-convert `\n` → `<br>` (currently literal)

### Pending — needs a live HawkSoft session + designated test client

- [ ] Capture the real `cs.hawksoft.app` create-log request/response shape
- [ ] Confirm the missing Path B channel codes (Fax / Letter / Text / Web) and action IDs
- [ ] Capture & persist the agency options dictionary (the human-readable code map)
- [ ] Decide whether multi-line text runs should auto-convert `\n` → `<br>` (currently literal)

### Pending — Path B wiring (only after the captures above)

- [ ] Extension manifest `host_permissions` for `cs.hawksoft.app` + a HawkSoft bridge/content script
- [ ] `createHawkSoftLog()` (ambient-cookie `fetch`) + dictionary bootstrap with TTL cache
- [ ] Route a real push through `buildHawkSoftNote` — **never** into the Path-A plain-text `note` field (would regress it)
- [ ] Kill switch + response-shape watchdog for internal-API drift
- [ ] A Node-safe `escapeHTML` if the builder is ever called server-side (it currently needs a DOM via `Utils.escapeHTML`)

### Open / TBD (tracked from the exploration)

- Attachment upload flow · websocket real-time channel · full TOS review before any Path B production use · whether HawkSoft will extend the partner API to support HTML + `created_by` (one focused rep conversation — the sanctioned escape hatch).

---

## Safety & Hygiene

- **Never use real client data** for Path B development/capture — only the designated test client.
- **Never log, transmit, or store** the `hstoken` / `cms` JWT cookies; let the browser attach them via `credentials: 'include'`.
- **Never share HawkSoft API responses externally** without redaction — they carry regulated PII (DOB, DL#, SSN where present).
- The note builder is a **security boundary** — changes to its escaping/scheme rules must keep `tests/hawksoft-note.test.js` green.

---

*Last updated: May 18, 2026. Re-verify all Path B findings against a current
HawkSoft session before any production implementation. See also
[`hawksoft-dictionary.json`](hawksoft-dictionary.json) and the related
`docs/technical/` HawkSoft analysis notes.*
