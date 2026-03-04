// DOM fingerprint caching for tab snapshots

const fingerprintCache = new Map();

export function getFingerprint(tabId) {
  return fingerprintCache.get(tabId) || null;
}

export function setFingerprint(tabId, hash) {
  fingerprintCache.set(tabId, hash);
}

export function hasChanged(tabId, newHash) {
  const old = fingerprintCache.get(tabId);
  if (!old) return true;
  return old !== newHash;
}

export function clearTab(tabId) {
  fingerprintCache.delete(tabId);
}
