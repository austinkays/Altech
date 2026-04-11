/**
 * Altech EZLynx Filler V2 — chrome.storage.local wrappers
 *
 * Thin async helpers used by the background service worker and popup.
 * Content scripts don't import this file — they call chrome.storage.local
 * directly through the sendMessage relay.
 */

async function getKeys(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
}

async function setKeys(obj) {
    return new Promise((resolve) => {
        chrome.storage.local.set(obj, () => resolve());
    });
}

async function removeKeys(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.remove(keys, () => resolve());
    });
}

function onChanged(callback) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        callback(changes);
    });
}

// Background SW loads this via importScripts — expose on self.
self.AltechV2Storage = { getKeys, setKeys, removeKeys, onChanged };
