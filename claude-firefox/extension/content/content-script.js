// Claude Browser Bridge - Content Script Message Handler
// Connects background.js to accessibility.js and interaction.js

(function () {
  "use strict";

  // ─── Console Capture (Circular Buffer) ─────────────────────────────────

  const MAX_CONSOLE_ENTRIES = 100;
  const _consoleBuf = new Array(MAX_CONSOLE_ENTRIES);
  let _consoleHead = 0;
  let _consoleCount = 0;

  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };

  function hookConsole() {
    ["log", "warn", "error", "info"].forEach((level) => {
      console[level] = (...args) => {
        const entry = {
          level,
          message: args.map((a) => {
            try {
              return typeof a === "string" ? a : JSON.stringify(a);
            } catch {
              return String(a);
            }
          }).join(" "),
          timestamp: Date.now(),
        };
        _consoleBuf[_consoleHead] = entry;
        _consoleHead = (_consoleHead + 1) % MAX_CONSOLE_ENTRIES;
        if (_consoleCount < MAX_CONSOLE_ENTRIES) _consoleCount++;
        originalConsole[level](...args);
      };
    });
  }

  function getConsoleEntries(since) {
    const result = [];
    if (_consoleCount === 0) return result;
    // Read from oldest to newest
    const start = _consoleCount < MAX_CONSOLE_ENTRIES ? 0 : _consoleHead;
    for (let i = 0; i < _consoleCount; i++) {
      const idx = (start + i) % MAX_CONSOLE_ENTRIES;
      const entry = _consoleBuf[idx];
      if (entry && (!since || entry.timestamp > since)) {
        result.push(entry);
      }
    }
    return result;
  }

  hookConsole();

  // ─── Text Content Extraction ─────────────────────────────────────────────

  const MAX_TEXT_LENGTH = 102400; // 100KB cap

  function extractTextContent() {
    // Try to find main content area
    const mainSelectors = [
      "main", "[role=main]", "article", ".content", "#content",
      ".main-content", "#main-content", ".post-content", ".entry-content",
    ];

    let contentEl = null;
    for (const sel of mainSelectors) {
      contentEl = document.querySelector(sel);
      if (contentEl) break;
    }

    if (!contentEl) {
      contentEl = document.body;
    }

    // Extract text, preserving some structure
    const lines = [];
    let totalLen = 0;
    const styleCache = new WeakMap();
    const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG"]);

    const walker = document.createTreeWalker(
      contentEl,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            // Skip script/style/nav elements (check before expensive getComputedStyle)
            if (SKIP_TAGS.has(tag)) {
              return NodeFilter.FILTER_REJECT;
            }
            // Check hidden with cached style
            if (node.hidden) return NodeFilter.FILTER_REJECT;
            let style = styleCache.get(node);
            if (!style) {
              style = getComputedStyle(node);
              styleCache.set(node, style);
            }
            if (style.display === "none" || style.visibility === "hidden") {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_SKIP;
          }
          // Text node
          const text = node.textContent.trim();
          if (!text) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text) {
        lines.push(text);
        totalLen += text.length;
        if (totalLen > MAX_TEXT_LENGTH) break;
      }
    }

    return {
      title: document.title,
      url: window.location.href,
      text: lines.join("\n"),
    };
  }

  // ─── Message Handler ─────────────────────────────────────────────────────

  browser.runtime.onMessage.addListener((msg, sender) => {
    const { action, params = {} } = msg;

    // Ping for health check
    if (action === "ping") {
      return Promise.resolve({ pong: true });
    }

    return handleAction(action, params);
  });

  // Track the last fingerprint returned for each filter via an explicit page_snapshot call.
  // Used to determine `cached: true` from the USER's perspective — not just whether the
  // background proactive rebuild already ran.  A proactive rebuild sets _mirrorDirty=false,
  // which would otherwise make the very first explicit snapshot appear "cached".
  const _lastSnapshotFp = {};

  async function handleAction(action, params) {
    try {
      switch (action) {
        case "snapshot": {
          const filter = params.filter || "all";
          const result = window.__claudeAccessibility.buildAccessibilityTree(filter, params.depth ?? null, params.startRef ?? null);

          const fp = result.fingerprint;
          // "cached" from user's perspective: same fingerprint as last explicit call for this filter
          const userCached = (fp !== undefined && fp !== "" && fp === _lastSnapshotFp[filter]);
          _lastSnapshotFp[filter] = fp;

          if (userCached) {
            return {
              tree: result.tree,
              fingerprint: fp,
              refCount: result.refCount,
              url: window.location.href,
              title: document.title,
              cached: true,
            };
          }

          // Only run edge case checks on fresh/changed data
          const edgeCases = window.__claudeInteraction.runEdgeCaseChecks();
          const response = {
            tree: result.tree,
            fingerprint: fp,
            refCount: result.refCount,
            url: window.location.href,
            title: document.title,
            edgeCases,
          };

          // Include diff if available
          if (result.diff) {
            response.diff = result.diff;
          }

          return response;
        }

        case "click": {
          return await window.__claudeInteraction.clickElement(params.ref);
        }

        case "dismiss_popup": {
          return window.__claudeInteraction.dismissPopup();
        }

        case "click_and_wait": {
          const result = await window.__claudeInteraction.clickElement(params.ref);
          // Wait for DOM to settle instead of fixed timeout
          if (result.success) {
            await window.__claudeInteraction.waitForDomSettle(params.waitMs || 3000, 200);
            // Take a fresh snapshot after waiting
            const snapshot = window.__claudeAccessibility.buildAccessibilityTree("all");
            result.snapshot = snapshot.tree;
            result.fingerprint = snapshot.fingerprint;
            if (snapshot.diff) {
              result.diff = snapshot.diff;
            }
            result.url = window.location.href;
            result.title = document.title;
          }
          return result;
        }

        case "type": {
          return await window.__claudeInteraction.typeText(params.ref, params.text);
        }

        case "fill": {
          return window.__claudeInteraction.fillElement(params.ref, params.value);
        }

        case "form_fill": {
          return window.__claudeInteraction.fillForm(params.fields);
        }

        case "form_fill_and_submit": {
          return await window.__claudeInteraction.fillFormAndSubmit(
            params.fields,
            params.submitRef
          );
        }

        case "content": {
          return extractTextContent();
        }

        case "evaluate": {
          // Evaluate JavaScript expression in page context
          // Use Function constructor to avoid direct eval CSP issues
          try {
            const fn = new Function("return (" + params.expression + ")");
            const evalResult = fn();
            return {
              result: evalResult === undefined ? "undefined"
                : evalResult === null ? "null"
                : typeof evalResult === "object" ? JSON.stringify(evalResult)
                : String(evalResult),
            };
          } catch (evalErr) {
            return { result: null, error: evalErr.message };
          }
        }

        case "hover": {
          return await window.__claudeInteraction.hoverElement(params.ref);
        }

        case "double_click": {
          return await window.__claudeInteraction.doubleClickElement(params.ref);
        }

        case "right_click": {
          return await window.__claudeInteraction.rightClickElement(params.ref);
        }

        case "key_press": {
          return await window.__claudeInteraction.keyPress(params.keys, params.ref ?? null);
        }

        case "find": {
          const matches = window.__claudeInteraction.findElements(params.query, params.maxResults ?? 20);
          return { matches };
        }

        case "drag": {
          // Drag from a ref element to another ref or to explicit coordinates
          if (params.toX !== undefined && params.toY !== undefined) {
            const fromEl = window.__claudeRefs?.get(params.fromRef);
            if (!fromEl || !document.contains(fromEl)) {
              return { success: false, error: `Element ${params.fromRef} not found or stale.` };
            }
            const rect = fromEl.getBoundingClientRect();
            const startX = rect.left + rect.width / 2;
            const startY = rect.top + rect.height / 2;
            return await window.__claudeInteraction.dragCoordinates(startX, startY, params.toX, params.toY, params.steps || 10);
          }
          return await window.__claudeInteraction.dragElement(params.fromRef, params.toRef, params.steps || 10);
        }

        case "console_read": {
          const since = params.since || 0;
          return { messages: getConsoleEntries(since) };
        }

        case "prebuild_snapshot": {
          // Proactive build triggered by background.js on navigation complete
          if (window.__claudeAccessibility?.fullRebuild) {
            window.__claudeAccessibility.fullRebuild("all");
          }
          return { prebuilt: true };
        }

        case "set_push_focus": {
          // Set focus selectors — subsequent pushes only walk these subtrees
          if (window.__claudeAccessibility?.setFocusSelectors) {
            window.__claudeAccessibility.setFocusSelectors(params.selectors);
            return { success: true, selectors: params.selectors };
          }
          return { error: "Accessibility module not loaded" };
        }

        case "clear_push_focus": {
          // Clear focus selectors — revert to full tree pushes
          if (window.__claudeAccessibility?.clearFocusSelectors) {
            window.__claudeAccessibility.clearFocusSelectors();
            return { success: true };
          }
          return { error: "Accessibility module not loaded" };
        }

        case "screenshot": {
          // Content script can't directly capture; return signal to background
          return { error: "Use background screenshot API", useBackground: true };
        }

        // ── Optimized wait: MutationObserver instead of polling ──
        case "wait_for_selector": {
          const selector = params.selector;
          const timeout = params.timeout || 10000;
          const root = document.body || document.documentElement;

          // Check immediately — element may already be present
          if (document.querySelector(selector)) {
            return { found: true, selector, elapsed: 0 };
          }

          return new Promise((resolve) => {
            const start = Date.now();

            const timer = setTimeout(() => {
              observer.disconnect();
              resolve({ found: false, selector, timedOut: true, elapsed: Date.now() - start });
            }, timeout);

            const observer = new MutationObserver(() => {
              if (document.querySelector(selector)) {
                clearTimeout(timer);
                observer.disconnect();
                resolve({ found: true, selector, elapsed: Date.now() - start });
              }
            });

            observer.observe(root, { childList: true, subtree: true, attributes: true });
          });
        }

        default:
          return { error: `Unknown content action: ${action}` };
      }
    } catch (err) {
      return { error: err.message || String(err) };
    }
  }
})();
