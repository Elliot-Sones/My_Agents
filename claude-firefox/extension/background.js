// Claude Browser Bridge - Background Script (ES Module)
// Central dispatcher: Native messaging connection, tab management, message routing

import { markTab, unmarkTab, setupTitleObserver } from "./lib/tab-marker.js";
import { setFingerprint, clearTab as clearCacheTab } from "./lib/cache.js";

// ─── State ───────────────────────────────────────────────────────────────────

let port = null;
let claudeTabIds = new Set();

// Per-tab-per-filter fingerprint cache for page_snapshot cached semantics.
// Key: "${tabId}:${filter}", Value: fingerprint string.
const _snapshotFpByFilter = new Map();

function _clearSnapshotFp(tabId) {
  for (const key of _snapshotFpByFilter.keys()) {
    if (key.startsWith(`${tabId}:`)) _snapshotFpByFilter.delete(key);
  }
}

// Network logs: circular buffer per tab
const networkLogs = new Map(); // tabId → { buf, head, count }
const MAX_NETWORK_ENTRIES = 50;
const MONITORED_TYPES = new Set([
  "xmlhttprequest", "main_frame", "sub_frame",
  "fetch", "websocket",
]);

// ─── Native Messaging ────────────────────────────────────────────────────────

function connectNative() {
  port = browser.runtime.connectNative("claude_browser_bridge");
  console.log("[Claude] Native host connected");

  port.onMessage.addListener((msg) => {
    handleRequest(msg);
  });

  port.onDisconnect.addListener((p) => {
    const err = p?.error ?? browser.runtime.lastError;
    console.log("[Claude] Native host disconnected:", err?.message ?? "(no error)");
    port = null;
    setTimeout(connectNative, 1000);
  });
}

function nativeSend(msg) {
  if (port) {
    port.postMessage(msg);
    return true;
  }
  return false;
}

function sendResponse(id, result) {
  nativeSend({ id, type: "response", result });
}

function sendError(id, error) {
  nativeSend({ id, type: "response", error: String(error) });
}

// ─── Tab Tracking ────────────────────────────────────────────────────────────

async function loadTrackedTabs() {
  const data = await browser.storage.local.get("claudeTabIds");
  if (data.claudeTabIds) {
    claudeTabIds = new Set(data.claudeTabIds);
    // Verify tabs still exist
    for (const tabId of [...claudeTabIds]) {
      try {
        await browser.tabs.get(tabId);
      } catch {
        claudeTabIds.delete(tabId);
      }
    }
    await saveTrackedTabs();
  }
}

async function saveTrackedTabs() {
  await browser.storage.local.set({ claudeTabIds: [...claudeTabIds] });
}

async function trackTab(tabId) {
  claudeTabIds.add(tabId);
  await saveTrackedTabs();
  await markTab(tabId);
  setupTitleObserver(tabId);
  // Proactively inject content scripts so first command doesn't need ping+timeout
  injectContentScripts(tabId).catch(() => {
    // Injection may fail on privileged pages; ensureContentScript will retry later
  });
}

async function untrackTab(tabId) {
  claudeTabIds.delete(tabId);
  await saveTrackedTabs();
  await unmarkTab(tabId);
  clearCacheTab(tabId);
  networkLogs.delete(tabId);
  // Tell MCP server to clear cached tree for this tab
  nativeSend({ type: "tab_state_clear", tabId });
}

// Clean up when any tab is closed
browser.tabs.onRemoved.addListener((tabId) => {
  if (claudeTabIds.has(tabId)) {
    claudeTabIds.delete(tabId);
    saveTrackedTabs();
    clearCacheTab(tabId);
    _clearSnapshotFp(tabId);
    networkLogs.delete(tabId);
    // Tell MCP server to clear cached tree for this tab
    nativeSend({ type: "tab_state_clear", tabId });
  }
});

// ─── Network Monitoring (Circular Buffer + Type Filter) ─────────────────────

function pushNetworkEntry(tabId, entry) {
  if (!networkLogs.has(tabId)) {
    networkLogs.set(tabId, {
      buf: new Array(MAX_NETWORK_ENTRIES),
      head: 0,
      count: 0,
    });
  }
  const log = networkLogs.get(tabId);
  log.buf[log.head] = entry;
  log.head = (log.head + 1) % MAX_NETWORK_ENTRIES;
  if (log.count < MAX_NETWORK_ENTRIES) log.count++;
}

function getNetworkEntries(tabId) {
  const log = networkLogs.get(tabId);
  if (!log || log.count === 0) return [];
  const result = [];
  const start = log.count < MAX_NETWORK_ENTRIES ? 0 : log.head;
  for (let i = 0; i < log.count; i++) {
    const idx = (start + i) % MAX_NETWORK_ENTRIES;
    if (log.buf[idx]) result.push(log.buf[idx]);
  }
  return result;
}

browser.webRequest.onCompleted.addListener(
  (details) => {
    if (!claudeTabIds.has(details.tabId)) return;
    // Only capture relevant request types
    if (!MONITORED_TYPES.has(details.type)) return;
    pushNetworkEntry(details.tabId, {
      url: details.url,
      method: details.method,
      statusCode: details.statusCode,
      type: details.type,
      timestamp: details.timeStamp,
    });
  },
  { urls: ["<all_urls>"] }
);

// ─── Content Script Injection ────────────────────────────────────────────────

async function injectContentScripts(tabId) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ["content/accessibility.js", "content/interaction.js", "content/content-script.js"],
  });
}

async function ensureContentScript(tabId) {
  try {
    // Try sending a ping to see if content script is loaded
    await browser.tabs.sendMessage(tabId, { action: "ping" });
  } catch {
    // Content script not loaded, inject it
    await injectContentScripts(tabId);
  }
}

async function sendToContentScript(tabId, message, timeoutMs = 30000) {
  await ensureContentScript(tabId);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Content script timeout")), timeoutMs);
    browser.tabs.sendMessage(tabId, message).then((response) => {
      clearTimeout(timer);
      resolve(response);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ─── Request Handler ─────────────────────────────────────────────────────────

async function handleRequest(msg) {
  const { id, action, params = {} } = msg;
  if (!id || !action) return;

  try {
    let result;
    switch (action) {
      // ── Tab actions ──
      case "tab_create":
        result = await handleTabCreate(params);
        break;
      case "tab_close":
        result = await handleTabClose(params);
        break;
      case "tab_list":
        result = await handleTabList();
        break;
      case "tab_navigate":
        result = await handleTabNavigate(params);
        break;
      case "tab_switch":
        result = await handleTabSwitch(params);
        break;


      // ── Page actions (forwarded to content script) ──
      // Accept both short names and MCP tool names
      case "page_snapshot":
      case "snapshot":
        result = await handleContentAction("snapshot", params);
        break;
      case "page_screenshot":
      case "screenshot":
        result = await handleContentAction("screenshot", params);
        break;
      case "page_content":
      case "content":
        result = await handleContentAction("content", params);
        break;
      case "element_click":
      case "click":
        result = await handleElementClick(params);
        break;
      case "click_and_wait":
        result = await handleClickAndWait(params);
        break;
      case "element_type":
      case "type":
        result = await handleContentAction("type", params);
        break;
      case "element_fill":
      case "fill":
        result = await handleContentAction("fill", params);
        break;
      case "form_fill":
        result = await handleContentAction("form_fill", params);
        break;
      case "form_fill_and_submit":
        result = await handleContentAction("form_fill_and_submit", params);
        break;
      case "dismiss_popup":
        result = await handleContentAction("dismiss_popup", params);
        break;
      case "element_drag":
      case "drag":
        result = await handleContentAction("drag", params);
        break;
      case "element_hover":
      case "hover":
        result = await handleContentAction("hover", params);
        break;
      case "element_double_click":
      case "double_click":
        result = await handleContentAction("double_click", params);
        break;
      case "element_right_click":
      case "right_click":
        result = await handleContentAction("right_click", params);
        break;
      case "key_press":
        result = await handleContentAction("key_press", params);
        break;
      case "find":
        result = await handleContentAction("find", params);
        break;
      case "set_push_focus":
        result = await handleContentAction("set_push_focus", params);
        break;
      case "clear_push_focus":
        result = await handleContentAction("clear_push_focus", params);
        break;
      case "page_evaluate":
      case "evaluate":
        result = await handleContentAction("evaluate", params);
        break;
      case "console_read":
        result = await handleContentAction("console_read", params);
        break;

      // ── Network ──
      case "network_requests":
        result = await handleNetworkRequests(params);
        break;

      // ── Wait ──
      case "wait_for":
        result = await handleWaitFor(params);
        break;

      // ── Status ──
      case "status":
        result = { connected: true, trackedTabs: [...claudeTabIds] };
        break;

      // ── Close all Claude tabs ──
      case "close_all_claude_tabs":
        result = await handleCloseAllTabs();
        break;

      default:
        sendError(id, `Unknown action: ${action}`);
        return;
    }
    sendResponse(id, result);
  } catch (err) {
    console.error(`[Claude] Error handling ${action}:`, err);
    sendError(id, err.message || String(err));
  }
}

// ─── Tab Handlers ────────────────────────────────────────────────────────────

async function handleTabCreate(params) {
  const tab = await browser.tabs.create({
    url: params.url || "about:blank",
    active: params.active === true,
  });
  await trackTab(tab.id);
  // Wait for page to load if a URL was given
  if (params.url && params.url !== "about:blank") {
    await waitForTabLoad(tab.id);
  }
  return {
    tabId: tab.id,
    url: tab.url,
    title: tab.title,
  };
}

async function handleTabClose(params) {
  const tabId = params.tabId;
  if (!tabId) throw new Error("tabId required");
  await untrackTab(tabId);
  await browser.tabs.remove(tabId);
  return { closed: true };
}

async function handleTabList() {
  const allTabs = await browser.tabs.query({});
  return allTabs.map((t) => ({
    tabId: t.id,
    url: t.url,
    title: t.title,
    active: t.active,
    claudeManaged: claudeTabIds.has(t.id),
  }));
}

async function handleTabNavigate(params) {
  const tabId = params.tabId;
  if (!tabId) throw new Error("tabId required");
  if (!params.url) throw new Error("url required");
  _clearSnapshotFp(tabId);
  await browser.tabs.update(tabId, { url: params.url });
  await waitForTabLoad(tabId);
  const tab = await browser.tabs.get(tabId);
  return { tabId: tab.id, url: tab.url, title: tab.title };
}

async function handleTabSwitch(params) {
  const tabId = params.tabId;
  if (!tabId) throw new Error("tabId required");
  await browser.tabs.update(tabId, { active: true });
  const tab = await browser.tabs.get(tabId);
  return { tabId: tab.id, url: tab.url, title: tab.title };
}

async function handleCloseAllTabs() {
  const ids = [...claudeTabIds];
  for (const tabId of ids) {
    try {
      await untrackTab(tabId);
      await browser.tabs.remove(tabId);
    } catch {
      // Tab may already be closed
    }
  }
  return { closed: ids.length };
}

// ─── Wait For ───────────────────────────────────────────────────────────────

async function handleWaitFor(params) {
  const tabId = params.tabId;
  if (!tabId) throw new Error("tabId required");
  const timeout = params.timeout || 10000;
  const startTime = Date.now();

  if (params.selector) {
    // Delegate to content script's MutationObserver-based wait.
    // Retries on CS errors (content script may not be injected yet after navigation).
    const deadline = startTime + timeout;
    while (Date.now() < deadline) {
      try {
        const remaining = deadline - Date.now();
        const result = await sendToContentScript(tabId, {
          action: "wait_for_selector",
          params: { selector: params.selector, timeout: remaining },
        }, remaining + 2000);
        // CS responded — return whatever it found
        return result;
      } catch {
        // Content script not ready yet (page still loading) — retry shortly
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return { found: false, selector: params.selector, timedOut: true };
  }

  if (params.url) {
    // Wait for URL to match pattern
    while (Date.now() - startTime < timeout) {
      const tab = await browser.tabs.get(tabId);
      if (tab.url && tab.url.includes(params.url)) {
        return { matched: true, url: tab.url, elapsed: Date.now() - startTime };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return { matched: false, pattern: params.url, timedOut: true };
  }

  // Pure timeout wait
  await new Promise((r) => setTimeout(r, timeout));
  return { waited: timeout };
}

// ─── Content Action Handler ──────────────────────────────────────────────────

async function handleContentAction(action, params) {
  // Determine target tab
  let tabId = params.tabId;
  if (!tabId) {
    // Use active tab in current window
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) throw new Error("No active tab found");
    tabId = activeTab.id;
  }

  // Special case: screenshot uses browser API directly
  if (action === "screenshot") {
    // Must activate the tab first — captureVisibleTab captures whatever is visible
    await browser.tabs.update(tabId, { active: true });
    await new Promise((r) => setTimeout(r, 150)); // let tab render
    const tab = await browser.tabs.get(tabId);
    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: params.format || "png",
      quality: params.quality || 80,
    });
    return { screenshot: dataUrl };
  }

  // Special case: evaluate via scripting API.
  // Run in the page's MAIN world so eval() is subject to the page's CSP (not extension CSP).
  // Most pages don't restrict eval; the isolated world and background both block it.
  if (action === "evaluate") {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: function(expr) {
        try {
          // eslint-disable-next-line no-eval
          var __r = eval(expr);
          if (__r === undefined) return "undefined";
          if (__r === null) return "null";
          if (typeof __r === "object") return JSON.stringify(__r);
          return String(__r);
        } catch (e) {
          return { __error: e.message };
        }
      },
      args: [params.expression],
    });
    const res = results[0]?.result;
    if (res && typeof res === "object" && res.__error) {
      return { result: null, error: res.__error };
    }
    return { result: res };
  }

  // Forward to content script
  const response = await sendToContentScript(tabId, { action, params });

  // Cache fingerprint if returned
  if (response && response.fingerprint) {
    setFingerprint(tabId, response.fingerprint);
  }

  // Snapshot-specific cached semantics: add cached:true when fingerprint unchanged since last call.
  // Tracked per-tab per-filter so filter="interactive" and filter="all" are independent.
  if (action === "snapshot" && response && response.fingerprint) {
    const filter = params.filter || "interactive";
    const fpKey = `${tabId}:${filter}`;
    const lastFp = _snapshotFpByFilter.get(fpKey);
    if (lastFp !== undefined && lastFp === response.fingerprint) {
      response.cached = true;
    }
    _snapshotFpByFilter.set(fpKey, response.fingerprint);
  }

  return response;
}

// ─── Network Requests Handler ────────────────────────────────────────────────

async function handleNetworkRequests(params) {
  const tabId = params.tabId;
  if (!tabId) throw new Error("tabId required");
  return { requests: getNetworkEntries(tabId) };
}

// ─── Element Click (navigation-aware) ───────────────────────────────────────
// Like handleClickAndWait but lightweight: no explicit waitFor, no forced snapshot.
// Detects full-page navigation and returns the new URL when it occurs.

async function handleElementClick(params) {
  const tabId = params.tabId;
  if (!tabId) throw new Error("tabId required");

  let navResolve;
  const navStarted = new Promise((resolve) => {
    navResolve = resolve;
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "loading") {
        browser.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });

  let csResult = null;
  let didNavigate = false;

  try {
    const winner = await Promise.race([
      sendToContentScript(tabId, { action: "click", params }, 10000).then((r) => ({ from: "cs", result: r })),
      navStarted.then(() => ({ from: "nav" })),
    ]);

    if (winner.from === "cs") {
      csResult = winner.result;
      navResolve(false);
    } else {
      didNavigate = true;
    }
  } catch {
    didNavigate = true;
    navResolve(false);
  }

  if (didNavigate) {
    // Full-page navigation triggered by click (e.g. HTML form submission).
    // Wait for the new page to load and return the new URL.
    await waitForTabComplete(tabId, 15000).catch(() => {});
    const tab = await browser.tabs.get(tabId).catch(() => ({ url: "", title: "" }));
    const newUrl = tab.url || "";
    return { success: true, verification: { urlChanged: true, newUrl, newTitle: tab.title }, url: newUrl };
  }

  // CS returned normally — no navigation. Return result as-is.
  // Clear snapshot fingerprints so next page_snapshot detects the DOM change.
  _clearSnapshotFp(tabId);
  if (csResult && csResult.fingerprint) {
    setFingerprint(tabId, csResult.fingerprint);
  }
  return csResult || { success: false, error: "No response from content script" };
}

// ─── Click and Wait (navigation-aware) ──────────────────────────────────────

async function handleClickAndWait(params) {
  const tabId = params.tabId;
  if (!tabId) throw new Error("tabId required");

  const waitFor = params.waitFor;
  const isUrlPattern = waitFor && isNaN(Number(waitFor));
  const waitMs = waitFor && !isNaN(Number(waitFor)) ? Number(waitFor) : 3000;

  // Race content script response against full-page navigation start
  let navResolve;
  const navStarted = new Promise((resolve) => {
    navResolve = resolve;
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "loading") {
        browser.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });

  let csResult = null;
  let didNavigate = false;

  try {
    const winner = await Promise.race([
      sendToContentScript(tabId, {
        action: "click_and_wait",
        params: { ref: params.ref, waitMs: isUrlPattern ? 2000 : waitMs },
      }, isUrlPattern ? 8000 : waitMs + 5000).then((r) => ({ from: "cs", result: r })),
      navStarted.then(() => ({ from: "nav" })),
    ]);

    if (winner.from === "cs") {
      csResult = winner.result;
      navResolve(false);
    } else {
      didNavigate = true;
    }
  } catch {
    didNavigate = true;
    navResolve(false);
  }

  const filter = params.filter || "interactive";

  if (!didNavigate && csResult) {
    // SPA or in-page navigation — CS already returned a snapshot
    const currentTab = await browser.tabs.get(tabId).catch(() => ({ url: "" }));
    const newUrl = csResult.url || currentTab.url;
    // If CS didn't include a snapshot (domChanged=false), take one now
    if (!csResult.snapshot) {
      const snap = await sendToContentScript(tabId, { action: "snapshot", params: { filter } }).catch(() => null);
      if (snap) csResult = { ...csResult, ...snap };
    }
    return { ...csResult, verification: { newUrl } };
  }

  // Full-page navigation — wait for the new page to fully load
  await waitForTabComplete(tabId, 30000).catch(() => {});
  const tab = await browser.tabs.get(tabId).catch(() => ({ url: "" }));
  const newUrl = tab.url || "";

  if (isUrlPattern && !newUrl.includes(waitFor)) {
    return { success: true, verification: { newUrl }, warning: `URL pattern "${waitFor}" not matched` };
  }

  // Take a fresh snapshot of the newly-loaded page
  const snap = await sendToContentScript(tabId, { action: "snapshot", params: { filter } }).catch(() => null);
  return { success: true, verification: { newUrl }, ...(snap || {}), url: newUrl };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

// Like waitForTabLoad but resolves immediately if tab is already 'complete'
async function waitForTabComplete(tabId, timeoutMs = 30000) {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === "complete") return;
  } catch {
    return;
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("Tab load timeout"));
    }, timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

// ─── Message handling from popup / other extension pages ─────────────────────

browser.runtime.onMessage.addListener((msg, sender) => {
  // Tree push from content script → forward to MCP server cache
  if (msg.type === "tree_push") {
    const tabId = sender.tab?.id;
    if (tabId && claudeTabIds.has(tabId)) {
      nativeSend({
        type: "tree_push",
        tabId,
        tree: msg.tree,
        fingerprint: msg.fingerprint,
        refCount: msg.refCount,
        url: msg.url,
        title: msg.title,
        text: msg.text || "",
      });
    }
    return Promise.resolve({ ok: true });
  }

  // Messages from popup
  if (msg.type === "get_status") {
    return Promise.resolve({
      connected: port !== null,
      trackedTabs: [...claudeTabIds],
    });
  }
  if (msg.type === "reconnect") {
    port?.disconnect();
    connectNative();
    return Promise.resolve({ ok: true });
  }
  if (msg.type === "close_all_claude_tabs") {
    return handleCloseAllTabs();
  }
  return false;
});

// ─── Proactive Snapshot Prebuild ──────────────────────────────────────────────
// When a tracked tab finishes loading, prebuild the accessibility tree so it's
// ready before Claude asks for a snapshot (reduces first-snapshot latency).

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" && claudeTabIds.has(tabId)) {
    sendToContentScript(tabId, { action: "prebuild_snapshot" }).catch(() => {
      // Content script may not be injected yet — safe to ignore
    });
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  console.log("[Claude] Browser Bridge starting...");
  await loadTrackedTabs();
  connectNative();
}

init();
