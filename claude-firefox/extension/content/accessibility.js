// Accessibility tree builder for Claude Browser Bridge
// Produces an enriched text-based accessibility tree with stable ref IDs

(function () {
  "use strict";

  // Global ref map: ref_id string → DOM element
  window.__claudeRefs = window.__claudeRefs || new Map();
  window.__claudeFingerprint = window.__claudeFingerprint || null;

  // ─── Stable Refs (WeakMap: DOM element → ref_id) ─────────────────────────

  const _elementToRef = new WeakMap();
  let _nextRefId = 0;

  function getOrCreateRef(el) {
    let refId = _elementToRef.get(el);
    if (refId !== undefined) return refId;
    refId = `ref_${_nextRefId++}`;
    _elementToRef.set(el, refId);
    return refId;
  }

  // ─── Mirror State ────────────────────────────────────────────────────────

  let _mirrorTree = null;
  let _mirrorFingerprint = null;
  let _mirrorRefCount = 0;
  let _mirrorLines = null;
  let _mirrorFilter = null;
  let _mirrorDirty = true;
  let _previousLines = null;
  let _rebuildTimer = null;

  // ─── Push Focus ─────────────────────────────────────────────────────────
  // When set, only these subtrees are walked on subsequent pushes.
  // null = full tree (default). Array of CSS selectors = focused mode.
  let _focusSelectors = null;

  function setFocusSelectors(selectors) {
    _focusSelectors = selectors && selectors.length > 0 ? selectors : null;
    _mirrorDirty = true;
    // Trigger immediate rebuild with new focus
    clearTimeout(_rebuildTimer);
    fullRebuild();
  }

  function clearFocusSelectors() {
    _focusSelectors = null;
    _mirrorDirty = true;
    clearTimeout(_rebuildTimer);
    fullRebuild();
  }

  // ─── MutationObserver (cache invalidation + debounced mirror rebuild) ────

  function setupCacheObserver() {
    // Disconnect previous observer (may hold stale closures from re-injection)
    if (window.__claudeCacheObserver) {
      window.__claudeCacheObserver.disconnect();
    }
    const observer = new MutationObserver(() => {
      _mirrorDirty = true;
      // Debounced proactive rebuild so mirror is ready when Claude asks
      clearTimeout(_rebuildTimer);
      // Always rebuild with "all" — the tree_push feeds the bridge cache which
      // serves filter="all" requests.  Using _mirrorFilter here could produce an
      // "interactive"-only tree that the bridge incorrectly serves as "all".
      _rebuildTimer = setTimeout(() => fullRebuild("all"), 100);
    });
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }
    window.__claudeCacheObserver = observer;
  }

  // Set up observer as soon as possible
  if (document.body) {
    setupCacheObserver();
  } else {
    document.addEventListener("DOMContentLoaded", setupCacheObserver, { once: true });
  }

  function invalidateCache() {
    _mirrorDirty = true;
  }

  // ─── Role Detection ──────────────────────────────────────────────────────

  const ROLE_MAP = {
    A: "link",
    BUTTON: "button",
    INPUT: "textbox",
    TEXTAREA: "textbox",
    SELECT: "combobox",
    IMG: "img",
    NAV: "navigation",
    MAIN: "main",
    HEADER: "banner",
    FOOTER: "contentinfo",
    ASIDE: "complementary",
    SECTION: "region",
    ARTICLE: "article",
    FORM: "form",
    TABLE: "table",
    THEAD: "rowgroup",
    TBODY: "rowgroup",
    TR: "row",
    TH: "columnheader",
    TD: "cell",
    UL: "list",
    OL: "list",
    LI: "listitem",
    DL: "list",
    DT: "term",
    DD: "definition",
    DIALOG: "dialog",
    DETAILS: "group",
    SUMMARY: "button",
    FIELDSET: "group",
    LEGEND: "legend",
    LABEL: "label",
    H1: "heading",
    H2: "heading",
    H3: "heading",
    H4: "heading",
    H5: "heading",
    H6: "heading",
    P: "paragraph",
    BLOCKQUOTE: "blockquote",
    PRE: "code",
    CODE: "code",
    HR: "separator",
    IFRAME: "frame",
    VIDEO: "video",
    AUDIO: "audio",
  };

  const INPUT_TYPE_ROLES = {
    checkbox: "checkbox",
    radio: "radio",
    range: "slider",
    number: "spinbutton",
    search: "searchbox",
    email: "textbox",
    tel: "textbox",
    url: "textbox",
    password: "textbox",
    submit: "button",
    reset: "button",
    button: "button",
    file: "button",
    image: "button",
  };

  // ─── Enrichment: Role → Default Tags ─────────────────────────────────────
  // When the actual tag differs from these defaults, we annotate with <tag>

  const ROLE_DEFAULT_TAGS = {
    link: ["A"],
    button: ["BUTTON", "INPUT", "SUMMARY"],
    textbox: ["INPUT", "TEXTAREA"],
    searchbox: ["INPUT"],
    checkbox: ["INPUT"],
    radio: ["INPUT"],
    combobox: ["SELECT"],
    img: ["IMG"],
    heading: ["H1", "H2", "H3", "H4", "H5", "H6"],
    slider: ["INPUT"],
    spinbutton: ["INPUT"],
    navigation: ["NAV"],
    main: ["MAIN"],
    banner: ["HEADER"],
    contentinfo: ["FOOTER"],
    complementary: ["ASIDE"],
    list: ["UL", "OL", "DL"],
    listitem: ["LI"],
    table: ["TABLE"],
    row: ["TR"],
    cell: ["TD"],
    columnheader: ["TH"],
    form: ["FORM"],
    article: ["ARTICLE"],
    region: ["SECTION"],
    dialog: ["DIALOG"],
    separator: ["HR"],
    paragraph: ["P"],
    blockquote: ["BLOCKQUOTE"],
    code: ["PRE", "CODE"],
    frame: ["IFRAME"],
    video: ["VIDEO"],
    audio: ["AUDIO"],
  };

  // ─── Enrichment: Semantic Region Markers ─────────────────────────────────

  const REGION_TAGS = new Set(["NAV", "MAIN", "ASIDE", "HEADER", "FOOTER"]);

  const REGION_NAMES = {
    NAV: "nav",
    MAIN: "main",
    ASIDE: "aside",
    HEADER: "header",
    FOOTER: "footer",
  };

  // ─── Enrichment: 12-Color Named Palette ──────────────────────────────────

  const NAMED_COLORS = [
    ["white", 255, 255, 255],
    ["black", 0, 0, 0],
    ["red", 255, 0, 0],
    ["green", 0, 128, 0],
    ["blue", 0, 0, 255],
    ["yellow", 255, 255, 0],
    ["orange", 255, 165, 0],
    ["purple", 128, 0, 128],
    ["pink", 255, 192, 203],
    ["gray", 128, 128, 128],
    ["brown", 139, 69, 19],
    ["cyan", 0, 255, 255],
  ];

  function parseRgb(str) {
    if (!str) return null;
    const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    return null;
  }

  function nearestColor(r, g, b) {
    let best = "gray";
    let bestDist = Infinity;
    for (const [name, cr, cg, cb] of NAMED_COLORS) {
      const dr = r - cr, dg = g - cg, db = b - cb;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = name;
      }
    }
    return best;
  }

  function getColorInfo(el, styleCache) {
    let style = styleCache.get(el);
    if (!style) {
      style = getComputedStyle(el);
      styleCache.set(el, style);
    }
    const fgRgb = parseRgb(style.color);
    const bgRgb = parseRgb(style.backgroundColor);
    const fg = fgRgb ? nearestColor(...fgRgb) : null;
    // Skip transparent backgrounds (rgba with alpha ≈ 0)
    let bg = null;
    if (bgRgb) {
      const bgStr = style.backgroundColor;
      const alphaMatch = bgStr.match(/rgba\([^)]+,\s*([\d.]+)\s*\)/);
      if (!alphaMatch || parseFloat(alphaMatch[1]) > 0.1) {
        bg = nearestColor(...bgRgb);
      }
    }
    return { fg, bg };
  }

  function getFontSizeCategory(el, styleCache) {
    let style = styleCache.get(el);
    if (!style) {
      style = getComputedStyle(el);
      styleCache.set(el, style);
    }
    const size = parseFloat(style.fontSize);
    if (isNaN(size)) return null;
    if (size <= 12) return "sm";
    if (size <= 16) return null; // md is default — don't show
    if (size <= 24) return "lg";
    return "xl";
  }

  // ─── Enrichment: Editor Framework Detection ──────────────────────────────

  function detectEditorFramework(el) {
    let node = el;
    for (let i = 0; i < 4; i++) { // el + 3 ancestors
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

  // ─── Enrichment: Icon Description ────────────────────────────────────────

  function getIconDescription(el) {
    const svg = el.querySelector("svg");
    if (svg) {
      const label = svg.getAttribute("aria-label");
      if (label) return label;
      const title = svg.querySelector("title");
      if (title?.textContent?.trim()) return title.textContent.trim();
      const use = svg.querySelector("use");
      if (use) {
        const href = use.getAttribute("href") || use.getAttribute("xlink:href");
        if (href) {
          const hashIdx = href.lastIndexOf("#");
          if (hashIdx !== -1) {
            const name = href.slice(hashIdx + 1).replace(/^icon[-_]?/, "");
            if (name) return name;
          }
        }
      }
    }
    const img = el.querySelector("img");
    if (img) {
      const alt = img.getAttribute("alt");
      if (alt?.trim()) return alt.trim();
      const label = img.getAttribute("aria-label");
      if (label?.trim()) return label.trim();
    }
    return null;
  }

  // ─── Enrichment: Build All Tokens for a Node ─────────────────────────────

  function buildEnrichments(el, role, interactive, name, styleCache) {
    const tokens = [];

    // Tag annotation: show when tag differs from role's default
    if (role) {
      const defaults = ROLE_DEFAULT_TAGS[role];
      if (defaults && !defaults.includes(el.tagName)) {
        tokens.push(`<${el.tagName.toLowerCase()}>`);
      }
    }

    // Contenteditable (only on elements that directly have the attribute)
    const ce = el.getAttribute("contenteditable");
    if (ce === "true" || ce === "") {
      tokens.push("[contenteditable]");
    }

    // Editor framework (for contenteditable / textbox / searchbox)
    if (ce === "true" || ce === "" || role === "textbox" || role === "searchbox") {
      const editor = detectEditorFramework(el);
      if (editor) tokens.push(`{editor:${editor}}`);
    }

    // Colors (interactive elements + headings only — keeps tree compact)
    if (interactive || role === "heading") {
      const { fg, bg } = getColorInfo(el, styleCache);
      if (fg) tokens.push(`fg:${fg}`);
      if (bg) tokens.push(`bg:${bg}`);
    }

    // Font size (only when not default md)
    if (interactive || role === "heading") {
      const fontCat = getFontSizeCategory(el, styleCache);
      if (fontCat) tokens.push(`font:${fontCat}`);
    }

    // Icon description (buttons/links with no text name)
    if ((role === "button" || role === "link") && !name) {
      const icon = getIconDescription(el);
      if (icon) tokens.push(`icon:"${icon}"`);
    }

    // href for links
    if (role === "link" || el.tagName === "A") {
      const href = el.getAttribute("href");
      if (href && href !== "#" && href !== "javascript:void(0)") {
        const truncated = href.length > 100 ? href.slice(0, 97) + "..." : href;
        tokens.push(`href="${truncated}"`);
      }
    }

    return tokens;
  }

  // ─── Optimized isInteractive (Set-based, no selector matching) ─────────

  const INTERACTIVE_TAGS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);
  const INTERACTIVE_ROLES = new Set([
    "button", "link", "textbox", "checkbox", "radio",
    "combobox", "menuitem", "tab", "switch", "slider",
    "searchbox",
  ]);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const MAX_DEPTH = 25;

  function isHidden(el, styleCache) {
    if (el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.hidden) return true;
    if (el.getAttribute("aria-hidden") === "true") return true;

    // checkVisibility() walks the ancestor chain to check display:none and
    // visibility:hidden. Unlike offsetWidth/offsetHeight, it doesn't depend on
    // layout being computed — so it works correctly in background tabs where
    // Firefox may not lay out dynamically added elements.
    if (typeof el.checkVisibility === "function") {
      return !el.checkVisibility();
    }

    // Fallback for very old Firefox without checkVisibility
    let style = styleCache.get(el);
    if (!style) {
      style = getComputedStyle(el);
      styleCache.set(el, style);
    }
    if (style.display === "none" || style.visibility === "hidden") return true;
    return false;
  }

  function isInteractive(el) {
    if (el.nodeType !== Node.ELEMENT_NODE) return false;
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute("tabindex") || el.hasAttribute("contenteditable")) return true;
    const role = el.getAttribute("role");
    return role ? INTERACTIVE_ROLES.has(role) : false;
  }

  function getRole(el) {
    // Explicit ARIA role takes priority
    const ariaRole = el.getAttribute("role");
    if (ariaRole) return ariaRole;

    const tag = el.tagName;

    // Special handling for input types
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return INPUT_TYPE_ROLES[type] || "textbox";
    }

    // Contenteditable elements are textboxes
    const ce = el.getAttribute("contenteditable");
    if (ce === "true" || ce === "") return "textbox";

    return ROLE_MAP[tag] || null;
  }

  function getName(el) {
    // 1. aria-label
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();

    // 2. aria-labelledby
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map((id) => {
        const ref = document.getElementById(id);
        return ref ? ref.textContent.trim() : "";
      }).filter(Boolean);
      if (parts.length) return parts.join(" ");
    }

    // 3. Label element (for inputs)
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent.trim();
    }
    // Also check wrapping label
    const parentLabel = el.closest("label");
    if (parentLabel) {
      // Get text not from the input itself
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
      const text = clone.textContent.trim();
      if (text) return text;
    }

    // 4. alt text (images)
    if (el.hasAttribute("alt")) return el.getAttribute("alt").trim();

    // 5. placeholder
    if (el.hasAttribute("placeholder")) return el.getAttribute("placeholder").trim();

    // 6. title
    if (el.hasAttribute("title")) return el.getAttribute("title").trim();

    // 7. Direct text content (for buttons, links, headings)
    const tag = el.tagName;
    if (["BUTTON", "A", "SUMMARY", "LEGEND", "LABEL", "H1", "H2", "H3", "H4", "H5", "H6", "TH", "DT", "OPTION"].includes(tag) || el.getAttribute("role") === "button" || el.getAttribute("role") === "link") {
      const text = el.textContent.trim();
      if (text.length <= 200) return text;
      return text.slice(0, 197) + "...";
    }

    return "";
  }

  function getValue(el) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "password") return "*".repeat((el.value || "").length);
      return el.value || "";
    }
    if (el.tagName === "SELECT") {
      return el.options[el.selectedIndex]?.textContent || "";
    }
    if (el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "") {
      return el.textContent.trim();
    }
    return null;
  }

  function getState(el) {
    const states = [];
    if (el.disabled) states.push("disabled");
    if (el.checked) states.push("checked");
    if (el.selected) states.push("selected");
    if (el.getAttribute("aria-expanded") === "true") states.push("expanded");
    if (el.getAttribute("aria-expanded") === "false") states.push("collapsed");
    if (el.required) states.push("required");
    if (el.readOnly) states.push("readonly");
    if (el.getAttribute("aria-busy") === "true") states.push("busy");
    if (el.getAttribute("aria-pressed") === "true") states.push("pressed");
    return states;
  }

  function getHeadingLevel(el) {
    const match = el.tagName.match(/^H(\d)$/);
    return match ? parseInt(match[1]) : null;
  }

  // ─── Optimized Hash (sample first/last 2000 chars + length) ────────────

  function simpleHash(str) {
    let hash = 0;
    const len = str.length;
    // Hash first 2000 chars
    const headEnd = Math.min(len, 2000);
    for (let i = 0; i < headEnd; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    // Hash last 2000 chars (if string is longer than 4000)
    if (len > 4000) {
      for (let i = len - 2000; i < len; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
    }
    // Mix in length
    hash = ((hash << 5) - hash) + len;
    hash |= 0;
    return hash.toString(36);
  }

  // ─── Diff Computation ─────────────────────────────────────────────────────

  function computeDiff(oldLines, newLines) {
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    const added = [];
    const removed = [];

    for (const line of newLines) {
      if (!oldSet.has(line)) added.push(line);
    }
    for (const line of oldLines) {
      if (!newSet.has(line)) removed.push(line);
    }

    const totalChanges = added.length + removed.length;
    const totalLines = Math.max(oldLines.length, newLines.length, 1);

    // If more than 30% changed, not worth sending a diff
    if (totalChanges / totalLines > 0.3) {
      return null;
    }

    return { added, removed, changedCount: totalChanges, totalLines: newLines.length };
  }

  // ─── Page Text Extraction ────────────────────────────────────────────────

  const MAX_TEXT_LENGTH = 102400; // 100KB cap
  const TEXT_SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "NAV", "HEADER", "FOOTER"]);

  function extractPageText() {
    const mainSelectors = ["main", "[role=main]", "article", ".content", "#content",
      ".main-content", "#main-content", ".post-content", ".entry-content"];
    let contentEl = null;
    for (const sel of mainSelectors) {
      contentEl = document.querySelector(sel);
      if (contentEl) break;
    }
    if (!contentEl) contentEl = document.body;
    if (!contentEl) return "";

    const lines = [];
    let totalLen = 0;
    const styleCache = new WeakMap();

    const walker = document.createTreeWalker(
      contentEl,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (TEXT_SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
            if (node.hidden) return NodeFilter.FILTER_REJECT;
            let style = styleCache.get(node);
            if (!style) { style = getComputedStyle(node); styleCache.set(node, style); }
            if (style.display === "none" || style.visibility === "hidden") return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_SKIP;
          }
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
    return lines.join("\n");
  }

  // ─── Full Rebuild (core tree walk with enrichments) ────────────────────────

  function fullRebuild(filter = "all", maxDepth = null) {
    const effectiveDepth = maxDepth ?? MAX_DEPTH;

    // Save previous lines for diff computation
    if (_mirrorLines && _mirrorFilter === filter) {
      _previousLines = _mirrorLines;
    } else {
      _previousLines = null;
    }

    // Rebuild __claudeRefs — only contains currently-visible elements
    window.__claudeRefs = new Map();
    const lines = [];
    const styleCache = new WeakMap();
    // Prevent duplicate output when multiple focus selectors match overlapping subtrees
    const _walkedElements = _focusSelectors ? new Set() : null;

    function walk(el, depth) {
      if (_walkedElements) {
        if (_walkedElements.has(el)) return;
        _walkedElements.add(el);
      }
      if (el.nodeType !== Node.ELEMENT_NODE) return;
      if (depth > effectiveDepth) return;
      if (isHidden(el, styleCache)) return;

      const tag = el.tagName;
      const role = getRole(el);
      const interactive = isInteractive(el);

      // Semantic region markers for landmark elements (no ref, just structure)
      if (REGION_TAGS.has(tag) && !el.getAttribute("role")) {
        const indent = "  ".repeat(depth);
        lines.push(`${indent}── ${REGION_NAMES[tag]} ──`);
        for (const child of el.children) {
          walk(child, depth + 1);
        }
        return;
      }

      // In "interactive" mode, skip non-interactive elements without interactive descendants
      if (filter === "interactive" && !interactive && !role) {
        for (const child of el.children) {
          walk(child, depth);
        }
        return;
      }

      // Determine if this node should be output
      let shouldOutput = false;
      if (interactive) {
        shouldOutput = true;
      } else if (filter === "all" && role) {
        shouldOutput = true;
      }

      if (shouldOutput) {
        const refId = getOrCreateRef(el);
        window.__claudeRefs.set(refId, el);

        const name = getName(el);
        const value = getValue(el);
        const states = getState(el);
        const level = getHeadingLevel(el);

        const indent = "  ".repeat(depth);
        let line = `${indent}[${refId}] ${role || tag.toLowerCase()}`;

        if (name) line += ` "${name}"`;
        if (level !== null) line += ` (level ${level})`;
        if (value !== null && value !== "") line += ` value="${value}"`;
        if (states.length) line += ` [${states.join(", ")}]`;

        // Enrichment tokens (tag, contenteditable, editor, colors, font, icon, href)
        const enrichTokens = buildEnrichments(el, role, interactive, name, styleCache);
        if (enrichTokens.length) line += ` ${enrichTokens.join(" ")}`;

        // Bounding box for spatial reasoning and drag coordinates
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          line += ` @{${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}}`;
        }

        lines.push(line);

        // Walk children at deeper indent
        for (const child of el.children) {
          walk(child, depth + 1);
        }
      } else {
        // Pass through - walk children at same depth
        for (const child of el.children) {
          walk(child, depth);
        }
      }
    }

    // If focus selectors are set, only walk those subtrees
    if (_focusSelectors && _focusSelectors.length > 0) {
      for (const sel of _focusSelectors) {
        try {
          const els = document.querySelectorAll(sel);
          for (const el of els) walk(el, 0);
        } catch { /* invalid selector — skip */ }
      }
    } else {
      walk(document.body, 0);
    }

    const treeText = lines.join("\n");
    const fingerprint = simpleHash(treeText);
    window.__claudeFingerprint = fingerprint;

    // Compute diff against previous snapshot
    let diff = null;
    if (_previousLines) {
      diff = computeDiff(_previousLines, lines);
    }

    // Update mirror state
    _mirrorTree = treeText;
    _mirrorFingerprint = fingerprint;
    _mirrorRefCount = window.__claudeRefs.size;
    _mirrorLines = lines;
    _mirrorFilter = filter;
    _mirrorDirty = false;

    // Push tree + text content to MCP server cache via background.js (fire-and-forget)
    try {
      browser.runtime.sendMessage({
        type: "tree_push",
        tree: treeText,
        fingerprint,
        refCount: _mirrorRefCount,
        url: window.location.href,
        title: document.title,
        text: extractPageText(),
      }).catch(() => {});
    } catch (_e) { /* not in extension context */ }

    return { tree: treeText, fingerprint, refCount: _mirrorRefCount, lines, diff };
  }

  // ─── Tree Builder (public API) ────────────────────────────────────────────

  function buildAccessibilityTree(filter = "all", maxDepth = null, startRef = null) {
    // Ensure observer is set up
    setupCacheObserver();

    // Focused subtree: bypass mirror, walk from specific element
    if (startRef) {
      const rootEl = window.__claudeRefs?.get(startRef);
      if (!rootEl || !document.contains(rootEl)) {
        return { tree: "", fingerprint: "", refCount: 0, error: `ref ${startRef} not found` };
      }
      const lines = [];
      const styleCache = new WeakMap();
      const depthLimit = maxDepth ?? MAX_DEPTH;
      let focusedRefCount = 0;

      function walkFocused(el, depth) {
        if (el.nodeType !== Node.ELEMENT_NODE) return;
        if (depth > depthLimit) return;
        if (isHidden(el, styleCache)) return;

        const tag = el.tagName;
        const role = getRole(el);
        const interactive = isInteractive(el);

        // Region markers in subtree too
        if (REGION_TAGS.has(tag) && !el.getAttribute("role")) {
          const indent = "  ".repeat(depth);
          lines.push(`${indent}── ${REGION_NAMES[tag]} ──`);
          for (const child of el.children) walkFocused(child, depth + 1);
          return;
        }

        if (filter === "interactive" && !interactive && !role) {
          for (const child of el.children) walkFocused(child, depth);
          return;
        }

        let shouldOutput = interactive || (filter === "all" && role);
        if (shouldOutput) {
          const refId = getOrCreateRef(el);
          window.__claudeRefs.set(refId, el);
          focusedRefCount++;

          const name = getName(el);
          const value = getValue(el);
          const states = getState(el);
          const level = getHeadingLevel(el);

          const indent = "  ".repeat(depth);
          let line = `${indent}[${refId}] ${role || tag.toLowerCase()}`;
          if (name) line += ` "${name}"`;
          if (level !== null) line += ` (level ${level})`;
          if (value !== null && value !== "") line += ` value="${value}"`;
          if (states.length) line += ` [${states.join(", ")}]`;

          // Enrichments
          const enrichTokens = buildEnrichments(el, role, interactive, name, styleCache);
          if (enrichTokens.length) line += ` ${enrichTokens.join(" ")}`;

          const rect = el.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) {
            line += ` @{${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}}`;
          }

          lines.push(line);
          for (const child of el.children) walkFocused(child, depth + 1);
        } else {
          for (const child of el.children) walkFocused(child, depth);
        }
      }

      walkFocused(rootEl, 0);
      const treeText = lines.join("\n");
      const fingerprint = simpleHash(treeText);
      return { tree: treeText, fingerprint, refCount: focusedRefCount };
    }

    const effectiveDepth = maxDepth ?? MAX_DEPTH;

    // Return mirror if fresh and filter matches (full tree only)
    if (!_mirrorDirty && _mirrorTree !== null && _mirrorFilter === filter && effectiveDepth === MAX_DEPTH) {
      return {
        tree: _mirrorTree,
        fingerprint: _mirrorFingerprint,
        refCount: _mirrorRefCount,
        cached: true,
      };
    }

    // Full rebuild needed
    const result = fullRebuild(filter, maxDepth);
    const response = { tree: result.tree, fingerprint: result.fingerprint, refCount: result.refCount };
    if (result.diff) {
      response.diff = result.diff;
    }
    return response;
  }

  // Export to global scope for content-script.js
  Object.defineProperty(window, "__claudeAccessibility", {
    value: { buildAccessibilityTree, invalidateCache, fullRebuild, setFocusSelectors, clearFocusSelectors },
    writable: true,
    configurable: true,
  });
})();
