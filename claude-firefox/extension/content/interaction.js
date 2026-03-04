// Interaction handler for Claude Browser Bridge
// Handles click, type, fill operations and edge case detection

(function () {
  "use strict";

  // ─── DOM Settle Detection ─────────────────────────────────────────────────

  function waitForDomSettle(timeout = 3000, debounce = 150) {
    // Uses MessageChannel instead of setTimeout for debouncing.
    // Firefox clamps setTimeout to ≥1000ms in background (unfocused) tabs,
    // which blows out the debounce window. MessageChannel fires as a normal
    // macrotask and is NOT subject to that throttle.

    return new Promise((resolve) => {
      const start = performance.now();
      let lastMutation = start;
      let done = false;

      const root = document.body || document.documentElement;
      const observer = new MutationObserver(() => {
        lastMutation = performance.now();
      });
      observer.observe(root, { childList: true, subtree: true, attributes: true });

      function finish() {
        if (done) return;
        done = true;
        observer.disconnect();
        resolve();
      }

      // Poll via MessageChannel — caps at ~50 checks/sec to avoid busy-looping
      const POLL_MS = 20;
      let lastPoll = start;

      function tick() {
        if (done) return;
        const now = performance.now();
        if (now - lastPoll < POLL_MS) {
          const ch = new MessageChannel();
          ch.port1.onmessage = tick;
          ch.port2.postMessage(null);
          return;
        }
        lastPoll = now;

        const elapsed = now - start;
        const sinceLastMutation = now - lastMutation;

        if (sinceLastMutation >= debounce || elapsed >= timeout) {
          finish();
        } else {
          const ch = new MessageChannel();
          ch.port1.onmessage = tick;
          ch.port2.postMessage(null);
        }
      }

      // Kick off the poll loop
      const ch = new MessageChannel();
      ch.port1.onmessage = tick;
      ch.port2.postMessage(null);
    });
  }

  // ─── Edge Case Detection ─────────────────────────────────────────────────

  // Track URL to only run edge case checks after navigation
  let _lastCheckedUrl = window.location.href;

  function detectPopupModal() {
    // Check for overlay/modal elements
    const candidates = document.querySelectorAll(
      "dialog[open], [role=dialog], [role=alertdialog], [aria-modal=true]"
    );
    for (const el of candidates) {
      if (!isElementHidden(el)) {
        return { detected: true, type: "dialog", element: describeElement(el) };
      }
    }

    // Check for position:fixed overlays covering significant viewport
    // Only query likely overlay elements instead of all elements
    const viewportArea = window.innerWidth * window.innerHeight;
    const overlayCandidates = document.querySelectorAll(
      'body > div[style*="fixed"], body > div[style*="absolute"], ' +
      'body > div[class*="overlay"], body > div[class*="modal"], ' +
      'body > div[class*="backdrop"], body > div[class*="popup"]'
    );
    for (const el of overlayCandidates) {
      const style = getComputedStyle(el);
      if (
        (style.position === "fixed" || style.position === "absolute") &&
        parseInt(style.zIndex) > 100
      ) {
        const rect = el.getBoundingClientRect();
        const elArea = rect.width * rect.height;
        if (elArea > viewportArea * 0.3) {
          return { detected: true, type: "overlay", element: describeElement(el) };
        }
      }
    }

    // Cookie banners
    const cookieSelectors = [
      "[class*=cookie]", "[id*=cookie]",
      "[class*=consent]", "[id*=consent]",
      "[class*=gdpr]", "[id*=gdpr]",
    ];
    for (const sel of cookieSelectors) {
      const el = document.querySelector(sel);
      if (el && !isElementHidden(el)) {
        return { detected: true, type: "cookie_banner", element: describeElement(el) };
      }
    }

    return { detected: false };
  }

  function detectLoginWall() {
    const loginPaths = ["/login", "/auth", "/sso", "/signin", "/cas/", "/sign-in", "/log-in"];
    const currentPath = window.location.pathname.toLowerCase();
    for (const path of loginPaths) {
      if (currentPath.includes(path)) {
        return { detected: true, url: window.location.href };
      }
    }
    return { detected: false };
  }

  function detectErrorPage() {
    const title = document.title.toLowerCase();
    const errorPatterns = ["404", "500", "error", "not found", "forbidden", "403", "502", "503"];
    for (const pattern of errorPatterns) {
      if (title.includes(pattern)) {
        return { detected: true, title: document.title };
      }
    }
    // Check for common error page indicators in body
    const bodyText = document.body?.innerText?.slice(0, 500)?.toLowerCase() || "";
    if (bodyText.includes("page not found") || bodyText.includes("internal server error")) {
      return { detected: true, bodyHint: bodyText.slice(0, 200) };
    }
    return { detected: false };
  }

  async function detectLoading() {
    // Use specific selectors only — broad class-contains matches cause false positives
    const loadingSelectors = [
      "[aria-busy=true]",
      ".loading", ".spinner", ".skeleton",
      "[role=progressbar]",
      "[aria-label*='loading' i]",
    ];
    let matchedSel = null;
    for (const sel of loadingSelectors) {
      if (document.querySelector(sel)) {
        matchedSel = sel;
        break;
      }
    }

    if (matchedSel) {
      // Wait up to 2 seconds for loading to finish (capped to keep clicks responsive)
      const start = Date.now();
      while (Date.now() - start < 2000) {
        await sleep(300);
        let stillLoading = false;
        for (const sel of loadingSelectors) {
          if (document.querySelector(sel)) {
            stillLoading = true;
            break;
          }
        }
        if (!stillLoading) {
          return { wasLoading: true, resolved: true, matchedSel };
        }
      }
      return { wasLoading: true, resolved: false, matchedSel };
    }

    return { wasLoading: false };
  }

  // Lazy edge case checks: only full check after URL changes
  function runEdgeCaseChecks(forceAll = false) {
    const currentUrl = window.location.href;
    const urlChanged = currentUrl !== _lastCheckedUrl;
    _lastCheckedUrl = currentUrl;

    // Always check for popups (they can appear without navigation)
    const result = {
      popup: detectPopupModal(),
    };

    // Only check login wall and error page after navigation or when forced
    if (urlChanged || forceAll) {
      result.loginWall = detectLoginWall();
      result.errorPage = detectErrorPage();
    }

    return result;
  }

  // ─── Verification ────────────────────────────────────────────────────────

  function capturePageState() {
    return {
      url: window.location.href,
      title: document.title,
      bodyLength: document.body?.innerHTML?.length || 0,
    };
  }

  function verifyChanges(before, after) {
    return {
      urlChanged: before.url !== after.url,
      titleChanged: before.title !== after.title,
      domChanged: Math.abs(before.bodyLength - after.bodyLength) > 100,
      newUrl: after.url,
      newTitle: after.title,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isElementHidden(el) {
    if (!el) return true;
    const style = getComputedStyle(el);
    return style.display === "none" || style.visibility === "hidden";
  }

  function describeElement(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
      : "";
    return `${tag}${id}${cls}`;
  }

  function getRefElement(ref) {
    if (!window.__claudeRefs) return null;
    return window.__claudeRefs.get(ref) || null;
  }

  // ─── Editor Framework Detection ─────────────────────────────────────────

  function detectEditorFramework(el) {
    let node = el;
    for (let i = 0; i < 4; i++) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) break;
      if (node.hasAttribute("data-lexical-editor")) return "lexical";
      if (node.classList.contains("ProseMirror")) return "prosemirror";
      if (node.classList.contains("cm-editor")) return "codemirror";
      if (node.classList.contains("ql-editor")) return "quill";
      if (node.classList.contains("monaco-editor")) return "monaco";
      node = node.parentElement;
    }
    return null;
  }

  function findLexicalRoot(el) {
    let node = el;
    for (let i = 0; i < 4; i++) {
      if (!node) break;
      if (node.__lexicalEditor) return node;
      if (node.hasAttribute && node.hasAttribute("data-lexical-editor")) return node;
      node = node.parentElement;
    }
    return null;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ─── Core Interaction Functions ──────────────────────────────────────────

  async function clickElement(ref) {
    const el = getRefElement(ref);
    if (!el || !document.contains(el)) {
      return {
        success: false,
        error: `Element ${ref} not found. Snapshot may be stale.`,
        needsSnapshot: true,
      };
    }

    const before = capturePageState();

    // Scroll into view and wait for settle
    el.scrollIntoView({ behavior: "instant", block: "center" });
    await waitForDomSettle(500, 50);

    // For checkboxes/radios: el.click() is the only reliable way to toggle state.
    // Firefox's dispatchEvent(click) already toggles, so calling BOTH causes double-toggle.
    // Use el.click() alone for these native controls.
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      el.click();
    } else {
      // Simulate full pointer/mouse event sequence for React/framework compatibility
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const eventOpts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: cx,
        clientY: cy,
        button: 0,
        buttons: 1,
      };
      el.dispatchEvent(new PointerEvent("pointerdown", { ...eventOpts, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent("mousedown", eventOpts));
      el.dispatchEvent(new PointerEvent("pointerup", { ...eventOpts, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent("mouseup", eventOpts));
      el.dispatchEvent(new MouseEvent("click", eventOpts));

      // dispatchEvent click is isTrusted:false and does NOT trigger HTML form submission
      // in Firefox. For submit buttons, call el.click() (native, trusted) which fires a
      // trusted click event that browsers recognize as a valid form submission trigger.
      if (el.form && el.type !== "button" && el.type !== "reset") {
        el.click();
      }
    }

    // Wait for DOM to settle after click
    await waitForDomSettle(3000, 150);

    // If a dialog is still open and the click target was inside it,
    // force-close via dialog.close() (bypasses isTrusted checks)
    const parentDialog = el.closest("dialog[open]");
    if (parentDialog) {
      parentDialog.close();
      await waitForDomSettle(500, 50);
    }

    // Check for loading indicators
    const loadResult = await detectLoading();

    const after = capturePageState();
    const verification = verifyChanges(before, after);
    const edgeCases = runEdgeCaseChecks();

    const result = {
      success: true,
      verification,
      edgeCases,
    };

    if (loadResult.wasLoading) {
      result.loading = loadResult;
    }

    // Include snapshot if page changed (saves a separate page_snapshot call)
    if (verification.urlChanged || verification.domChanged) {
      const snapshot = window.__claudeAccessibility.buildAccessibilityTree("all");
      result.snapshot = snapshot.tree;
      result.fingerprint = snapshot.fingerprint;
      if (snapshot.diff) {
        result.diff = snapshot.diff;
      }
    }

    return result;
  }

  async function typeText(ref, text) {
    const el = getRefElement(ref);
    if (!el) {
      return {
        success: false,
        error: `Element ${ref} not found. Snapshot may be stale.`,
        needsSnapshot: true,
      };
    }

    el.focus();
    // Minimal settle wait after focus (replaces fixed sleep(50))
    await waitForDomSettle(300, 30);

    // For contenteditable rich text editors — use framework-specific APIs
    if (el.isContentEditable) {
      const framework = detectEditorFramework(el);

      // Lexical: execCommand is silently ignored. Use Lexical's own state API.
      if (framework === "lexical") {
        const lexEl = findLexicalRoot(el);
        const lex = lexEl?.__lexicalEditor;
        if (lex) {
          try {
            const stateJson = JSON.stringify({
              root: {
                children: [{
                  children: [{ detail: 0, format: 0, mode: "normal", style: "", text, type: "text", version: 1 }],
                  direction: "ltr", format: "", indent: 0, type: "paragraph", version: 1, textFormat: 0,
                }],
                direction: "ltr", format: "", indent: 0, type: "root", version: 1,
              },
            });
            lex.setEditorState(lex.parseEditorState(stateJson));
            return { success: true, typed: text, framework: "lexical", ...detectSubmitHint(el) };
          } catch (e) {
            // Fall through to execCommand
          }
        }
      }

      // Quill: similar to Lexical — execCommand may not register.
      // Set innerHTML + fire InputEvent to sync framework state.
      if (framework === "quill") {
        el.focus();
        el.innerHTML = `<p>${escapeHtml(text)}</p>`;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
        return { success: true, typed: text, framework: "quill", ...detectSubmitHint(el) };
      }

      // ProseMirror, CodeMirror, Monaco: execCommand('insertText') works
      document.execCommand("insertText", false, text);
      return { success: true, typed: text, framework: framework || "contenteditable", ...detectSubmitHint(el) };
    }

    for (const char of text) {
      const eventInit = {
        key: char,
        code: `Key${char.toUpperCase()}`,
        charCode: char.charCodeAt(0),
        keyCode: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      };
      el.dispatchEvent(new KeyboardEvent("keydown", eventInit));
      el.dispatchEvent(new KeyboardEvent("keypress", eventInit));
      el.dispatchEvent(new InputEvent("beforeinput", {
        data: char,
        inputType: "insertText",
        bubbles: true,
        cancelable: true,
      }));
      el.dispatchEvent(new InputEvent("input", {
        data: char,
        inputType: "insertText",
        bubbles: true,
        cancelable: true,
      }));
      el.dispatchEvent(new KeyboardEvent("keyup", eventInit));
    }

    // Also set value directly as a fallback for frameworks
    if ("value" in el) {
      // Use native setter to trigger React/Vue watchers
      const nativeSetter = Object.getOwnPropertyDescriptor(
        el.constructor.prototype, "value"
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(el, (el.value || "") + text);
      } else {
        el.value = (el.value || "") + text;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return { success: true, typed: text, ...detectSubmitHint(el) };
  }

  // After typing, detect how to submit — look for nearby submit button or assume Enter
  function detectSubmitHint(el) {
    // Walk up to find the containing form or container
    const form = el.closest("form") || el.parentElement?.closest("form");
    if (form) {
      // Look for submit-like buttons in the form
      const buttons = form.querySelectorAll('button, [role="button"], input[type="submit"]');
      for (const btn of buttons) {
        const label = (btn.getAttribute("aria-label") || btn.textContent || "").trim().toLowerCase();
        if (/send|submit|search|go|ask/i.test(label) && !btn.disabled) {
          const ref = btn.__claudeRef || findRefForElement(btn);
          if (ref) return { submitHint: "button", submitRef: ref, submitLabel: label };
        }
      }
    }
    // Default: Enter key submits (works for most search/chat inputs)
    return { submitHint: "enter" };
  }

  function findRefForElement(el) {
    if (!window.__claudeRefs) return null;
    for (const [refId, refEl] of window.__claudeRefs) {
      if (refEl === el) return refId;
    }
    return null;
  }

  function fillElement(ref, value) {
    const el = getRefElement(ref);
    if (!el) {
      return {
        success: false,
        error: `Element ${ref} not found. Snapshot may be stale.`,
        needsSnapshot: true,
      };
    }

    // Use native setter for React/Vue compatibility
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el.constructor.prototype, "value"
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    return { success: true, value };
  }

  function fillForm(fields) {
    const results = [];
    for (const field of fields) {
      const result = fillElement(field.ref, field.value);
      results.push({ ref: field.ref, ...result });
    }
    const allSuccess = results.every((r) => r.success);
    return { success: allSuccess, fields: results };
  }

  async function fillFormAndSubmit(fields, submitRef) {
    const fillResult = fillForm(fields);
    if (!fillResult.success) {
      return { success: false, fillResult, error: "Some fields failed to fill" };
    }

    // Brief settle after filling before submit
    await waitForDomSettle(500, 50);

    const clickResult = await clickElement(submitRef);
    return {
      success: clickResult.success,
      fillResult,
      clickResult,
    };
  }

  // ─── Hover ───────────────────────────────────────────────────────────────

  async function hoverElement(ref) {
    const el = getRefElement(ref);
    if (!el || !document.contains(el)) {
      return { success: false, error: `Element ${ref} not found or stale.`, needsSnapshot: true };
    }
    el.scrollIntoView({ behavior: "instant", block: "center" });
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, pointerId: 1 };
    el.dispatchEvent(new PointerEvent("pointerover", opts));
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new PointerEvent("pointermove", opts));
    el.dispatchEvent(new MouseEvent("mousemove", opts));
    el.dispatchEvent(new MouseEvent("mouseenter", { ...opts, bubbles: false }));
    await waitForDomSettle(1500, 100);
    // Rebuild snapshot to show revealed content
    const snapshot = window.__claudeAccessibility.buildAccessibilityTree("all");
    return { success: true, snapshot: snapshot.tree, fingerprint: snapshot.fingerprint };
  }

  // ─── Double Click ─────────────────────────────────────────────────────────

  async function doubleClickElement(ref) {
    const el = getRefElement(ref);
    if (!el || !document.contains(el)) {
      return { success: false, error: `Element ${ref} not found or stale.`, needsSnapshot: true };
    }
    const before = capturePageState();
    el.scrollIntoView({ behavior: "instant", block: "center" });
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
    // First click
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", { ...opts, detail: 1 }));
    // Second click
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", { ...opts, detail: 2 }));
    el.dispatchEvent(new MouseEvent("dblclick", { ...opts, detail: 2 }));
    await waitForDomSettle(2000, 150);
    const after = capturePageState();
    const verification = verifyChanges(before, after);
    const result = { success: true, verification };
    if (verification.urlChanged || verification.domChanged) {
      const snapshot = window.__claudeAccessibility.buildAccessibilityTree("all");
      result.snapshot = snapshot.tree;
      result.fingerprint = snapshot.fingerprint;
      if (snapshot.diff) {
        result.diff = snapshot.diff;
      }
    }
    return result;
  }

  // ─── Right Click ─────────────────────────────────────────────────────────

  async function rightClickElement(ref) {
    const el = getRefElement(ref);
    if (!el || !document.contains(el)) {
      return { success: false, error: `Element ${ref} not found or stale.`, needsSnapshot: true };
    }
    el.scrollIntoView({ behavior: "instant", block: "center" });
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 2, buttons: 2 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("contextmenu", opts));
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    await waitForDomSettle(1000, 100);
    const snapshot = window.__claudeAccessibility.buildAccessibilityTree("all");
    return { success: true, snapshot: snapshot.tree, fingerprint: snapshot.fingerprint };
  }

  // ─── Key Press ────────────────────────────────────────────────────────────

  const KEY_CODES = {
    Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, Space: 32,
    ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
    Home: 36, End: 35, PageUp: 33, PageDown: 34,
    F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F12: 123,
  };

  async function keyPress(keys, targetRef) {
    const target = targetRef
      ? (getRefElement(targetRef) || document.activeElement)
      : document.activeElement || document.body;

    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      const parts = key.split("+");
      const mainKey = parts[parts.length - 1];
      const ctrlKey = parts.includes("ctrl") || parts.includes("control");
      const shiftKey = parts.includes("shift");
      const altKey = parts.includes("alt");
      const metaKey = parts.includes("meta") || parts.includes("cmd");
      const keyCode = KEY_CODES[mainKey] ?? mainKey.charCodeAt(0);
      const opts = {
        key: mainKey, code: mainKey === " " ? "Space" : mainKey,
        keyCode, which: keyCode,
        bubbles: true, cancelable: true,
        ctrlKey, shiftKey, altKey, metaKey,
      };
      target.dispatchEvent(new KeyboardEvent("keydown", opts));
      target.dispatchEvent(new KeyboardEvent("keypress", opts));
      target.dispatchEvent(new KeyboardEvent("keyup", opts));
    }
    await waitForDomSettle(1500, 100);
    const snapshot = window.__claudeAccessibility.buildAccessibilityTree("all");
    return { success: true, snapshot: snapshot.tree, fingerprint: snapshot.fingerprint };
  }

  // ─── Find ─────────────────────────────────────────────────────────────────

  function findElements(query, maxResults = 20) {
    if (!window.__claudeRefs || window.__claudeRefs.size === 0) return [];
    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/);
    const scored = [];
    for (const [refId, el] of window.__claudeRefs) {
      if (!document.contains(el)) continue;
      const parts = [
        el.getAttribute("role") || "",
        el.tagName.toLowerCase(),
        el.getAttribute("aria-label") || "",
        el.getAttribute("placeholder") || "",
        el.getAttribute("title") || "",
        el.getAttribute("name") || "",
        el.getAttribute("type") || "",
        el.id || "",
        el.textContent?.trim().slice(0, 300) || "",
        el.value || "",
      ].join(" ").toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (parts.includes(word)) score++;
      }
      if (parts.includes(queryLower)) score += queryWords.length; // exact phrase bonus
      if (score > 0) scored.push({ refId, el, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map(({ refId, el }) => {
      const role = el.getAttribute("role") || el.tagName.toLowerCase();
      const name = el.getAttribute("aria-label") || el.getAttribute("placeholder") ||
        el.textContent?.trim().slice(0, 80) || "";
      const rect = el.getBoundingClientRect();
      return {
        ref: refId, role, name,
        bbox: `@{${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}}`,
      };
    });
  }

  // ─── Drag ────────────────────────────────────────────────────────────────

  async function dragElement(fromRef, toRef, steps = 10) {
    const fromEl = getRefElement(fromRef);
    if (!fromEl || !document.contains(fromEl)) {
      return { success: false, error: `Element ${fromRef} not found or stale.`, needsSnapshot: true };
    }
    const fromRect = fromEl.getBoundingClientRect();
    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;

    if (toRef) {
      const toEl = getRefElement(toRef);
      if (!toEl || !document.contains(toEl)) {
        return { success: false, error: `Element ${toRef} not found or stale.`, needsSnapshot: true };
      }
      const toRect = toEl.getBoundingClientRect();
      const endX = toRect.left + toRect.width / 2;
      const endY = toRect.top + toRect.height / 2;
      return dragCoordinates(startX, startY, endX, endY, steps);
    }

    return { success: false, error: "toRef is required for dragElement" };
  }

  async function dragCoordinates(startX, startY, endX, endY, steps = 10) {
    function makeOpts(x, y, buttons = 1) {
      return {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, screenX: x, screenY: y,
        button: 0, buttons, pointerId: 1, pointerType: "mouse", isPrimary: true,
      };
    }

    const startEl = document.elementFromPoint(startX, startY) || document.body;
    startEl.dispatchEvent(new PointerEvent("pointerdown", makeOpts(startX, startY)));
    startEl.dispatchEvent(new MouseEvent("mousedown", makeOpts(startX, startY)));
    await sleep(16);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;
      const moveEl = document.elementFromPoint(x, y) || document.body;
      moveEl.dispatchEvent(new PointerEvent("pointermove", makeOpts(x, y)));
      moveEl.dispatchEvent(new MouseEvent("mousemove", makeOpts(x, y)));
      await sleep(16);
    }

    const endEl = document.elementFromPoint(endX, endY) || document.body;
    endEl.dispatchEvent(new PointerEvent("pointerup", makeOpts(endX, endY, 0)));
    endEl.dispatchEvent(new MouseEvent("mouseup", makeOpts(endX, endY, 0)));
    endEl.dispatchEvent(new MouseEvent("click", makeOpts(endX, endY, 0)));

    await waitForDomSettle(2000, 150);

    const before = capturePageState();
    const after = capturePageState();
    return {
      success: true,
      from: { x: Math.round(startX), y: Math.round(startY) },
      to: { x: Math.round(endX), y: Math.round(endY) },
      steps,
      verification: verifyChanges(before, after),
    };
  }

  // ─── Dialog Dismissal ───────────────────────────────────────────────────

  function dismissPopup() {
    // Close HTML <dialog> elements directly (bypasses isTrusted checks)
    const dialogs = document.querySelectorAll("dialog[open]");
    let closed = 0;
    for (const dialog of dialogs) {
      dialog.close();
      closed++;
    }

    // Also try removing aria-modal overlays
    const modals = document.querySelectorAll("[aria-modal=true], [role=dialog]");
    for (const modal of modals) {
      if (!isElementHidden(modal)) {
        modal.remove();
        closed++;
      }
    }

    return { success: closed > 0, closed };
  }

  // ─── Export to global scope ──────────────────────────────────────────────

  window.__claudeInteraction = {
    clickElement,
    typeText,
    fillElement,
    fillForm,
    fillFormAndSubmit,
    dismissPopup,
    runEdgeCaseChecks,
    detectLoading,
    waitForDomSettle,
    dragElement,
    dragCoordinates,
    hoverElement,
    doubleClickElement,
    rightClickElement,
    keyPress,
    findElements,
  };
})();
