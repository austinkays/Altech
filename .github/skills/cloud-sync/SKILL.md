---
name: cloud-sync
description: >
  Guide for integrating a new data type into Altech's cloud sync system (Firestore via cloud-sync.js).
  Use this skill when adding a new plugin that stores user data, when debugging sync issues,
  or when a new localStorage key needs to be replicated across devices.
  Covers all 4 required touchpoints in cloud-sync.js and the localStorage conventions.
---

# Cloud Sync Integration — Altech Field Lead

`js/cloud-sync.js` manages bidirectional sync between `localStorage` and Firestore.
It supports 7 document types. When adding a new plugin with persistent user data, you must
update all 4 touchpoints below — missing any one causes silent data loss or stale UI.

---

## Firestore Structure

```
users/{uid}/sync/{docType}    ← main sync docs (one per data type)
users/{uid}/quotes/{quoteId}  ← quotes use a subcollection instead
```

Each sync doc shape:
```json
{
  "data": "<serialized payload>",
  "updatedAt": "<Firestore Timestamp>",
  "deviceId": "<string>"
}
```

---

## The 4 Required Touchpoints

### 1. `_getLocalData()` — Snapshot builder

This function reads all localStorage data into a single object for pushing to the cloud.
Add your key here:

```javascript
function _getLocalData() {
    return {
        // ... existing keys ...
        yourData: tryParse('altech_your_key'),   // ← ADD THIS
    };
}
```

`tryParse` safely parses JSON and returns `null` on failure — always use it, never `JSON.parse` directly.

---

### 2. `pushToCloud()` — Push your data

Find the `Promise.all([...])` call inside `pushToCloud()` and add your doc:

```javascript
await Promise.all([
    // ... existing pushes ...
    _pushDoc('yourData', localData.yourData),   // ← ADD THIS
]);
```

`_pushDoc(docType, data)` serializes and writes to `users/{uid}/sync/yourData`.

---

### 3. `pullFromCloud()` — Pull and restore

Find the pull section (series of `_pullDoc` calls) and add yours, then refresh the UI:

```javascript
const yourDoc = await _pullDoc('yourData');
if (yourDoc) {
    localStorage.setItem('altech_your_key', JSON.stringify(yourDoc));
    if (typeof YourPlugin !== 'undefined') YourPlugin.render();
}
```

**Order matters:** Pull happens on login and on manual sync. Always call `YourPlugin.render()` after restoring so the UI reflects the pulled data.

---

### 4. `deleteCloudData()` — Cleanup on account delete/wipe

Find the `syncDocs` array and add your doc type:

```javascript
const syncDocs = [
    // ... existing doc types ...
    'yourData',   // ← ADD THIS
];
```

This ensures user data is fully deleted when they wipe their account.

---

## localStorage Conventions

| Rule | Details |
|------|---------|
| Key prefix | Always `altech_` (e.g., `altech_your_key`) |
| Format | Always store as JSON string |
| Reading | Use `tryParse('altech_your_key')` in `cloud-sync.js`, `JSON.parse(localStorage.getItem(...))` elsewhere |
| Writing | After any localStorage write for synced data, call `CloudSync.schedulePush()` |
| Never | Write directly to `altech_v6` — that's the encrypted core form store managed by `App.save()` |

---

## Triggering a Push from Your Module

After any save in your plugin:

```javascript
function _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (typeof CloudSync !== 'undefined') CloudSync.schedulePush(); // 3s debounce
}
```

`schedulePush()` is debounced at 3 seconds — it's safe to call on every keystroke.

---

## Conflict Resolution

`cloud-sync.js` uses **last-write-wins** based on `updatedAt` timestamp. The most recently updated copy (local or cloud) wins. There's no merge — if two devices edit simultaneously, one change will be lost. This is intentional for simplicity.

---

## Debugging Sync Issues

1. Open DevTools → Application → Local Storage → check `altech_your_key` exists and has correct data
2. Open Firestore console → `users/{uid}/sync/yourData` → check the document exists and `data` field is populated
3. Check the browser console for errors from `cloud-sync.js` — it logs push/pull failures with the doc type
4. Verify `CloudSync.schedulePush()` is being called after saves (add a `console.log` temporarily)
5. Check that `_getLocalData()` returns your key (add a `console.log(localData)` in `pushToCloud`)

---

## Checklist

- [ ] `_getLocalData()` updated with new key
- [ ] `pushToCloud()` Promise.all updated
- [ ] `pullFromCloud()` updated with pull + UI refresh
- [ ] `deleteCloudData()` syncDocs array updated
- [ ] Plugin's `_save()` calls `CloudSync.schedulePush()`
- [ ] Tested: make a change, wait 3s, check Firestore console for the doc
- [ ] Tested: wipe localStorage, reload, verify data pulls from cloud
- [ ] `npm test` → 0 failures
- [ ] Commit and push
