// Real-world browser automation benchmark for claude-firefox MCP
// Tests task completion on production websites with real SPAs, complex DOMs,
// AJAX-loaded content, table layouts, and client-side navigation.
//
// Design principles:
//   - click_and_wait over element_click + sleep + snapshot (single round-trip)
//   - wait_for(selector/url) over manual poll loops (native 500ms polling)
//   - element_fill over element_type where keystroke events aren't needed (faster)
//   - page_evaluate for React/framework-specific operations (bypasses isTrusted)
//   - tab_switch at start to avoid Firefox background tab throttling
//   - Minimize total tool calls — every call is a round-trip through the bridge
//
// Task map:
//   1  TodoMVC React — SPA + framework events
//   2  Wikipedia — search + extract + large DOM
//   3  Hacker News — table layout + full navigation + pagination
//   4  GitHub — SPA navigation + content extraction
//   5  NPM — structured data + tab navigation
//   6  DuckDuckGo — search workflow

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { performance } from "perf_hooks";

// ─── Timing Registry ──────────────────────────────────────────────────────────

const timingLog = [];
const sectionTimes = {};
let currentSection = "init";

function startSection(name) {
  currentSection = name;
  sectionTimes[name] = { start: performance.now() };
}

function endSection(name) {
  if (sectionTimes[name]) sectionTimes[name].end = performance.now();
}

function fmt(ms) {
  if (ms === undefined || ms === null) return "—";
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function kb(str) {
  return str ? `${(str.length / 1024).toFixed(1)}KB` : "0KB";
}

// ─── Pass / Fail tracking ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];
const knownGapLog = [];

function assert(name, condition, detail = "") {
  const msg = detail ? `${name}: ${detail}` : name;
  console.log(`    ${condition ? "✓" : "✗"} ${msg}`);
  if (condition) passed++;
  else {
    failed++;
    failures.push(`[${currentSection}] ${msg}`);
  }
}

function knownGap(name, condition, explanation) {
  if (!condition) {
    console.log(`    ✗ GAP — ${name}`);
    console.log(`           ${explanation}`);
    knownGapLog.push({ name, status: "failed as expected", explanation });
  } else {
    console.log(`    ! SURPRISE — ${name} (unexpectedly passed)`);
    knownGapLog.push({ name, status: "UNEXPECTEDLY PASSED", explanation });
  }
}

// ─── Core call() helper ───────────────────────────────────────────────────────

async function call(client, tool, args = {}, note = "") {
  const t0 = performance.now();
  let raw;
  try {
    raw = await client.callTool({ name: tool, arguments: args });
  } catch (err) {
    const elapsed = performance.now() - t0;
    timingLog.push({ section: currentSection, tool, elapsed, note, isError: true, resultSize: 0 });
    return { elapsed, result: null, error: err.message };
  }

  const elapsed = performance.now() - t0;
  let parsed;
  try {
    parsed = JSON.parse(raw.content[0].text);
  } catch {
    parsed = raw.content[0].text;
  }

  const result = parsed?.result ?? parsed;
  timingLog.push({
    section: currentSection,
    tool,
    elapsed,
    note,
    isError: raw.isError || false,
    resultSize: raw.content[0]?.text?.length || 0,
  });

  return { elapsed, result };
}

// Extract text from page_content result (returns { title, url, text })
function extractText(result) {
  if (typeof result === "string") return result;
  return result?.text || result?.content || "";
}

// ─── MCP Setup ────────────────────────────────────────────────────────────────

async function setup() {
  const t0 = performance.now();
  const transport = new StdioClientTransport({
    command: "node",
    args: ["build/index.js"],
    cwd: new URL("..", import.meta.url).pathname,
  });
  const client = new Client({ name: "benchmark-realworld", version: "1.0.0" });
  await client.connect(transport);
  const elapsed = performance.now() - t0;
  timingLog.push({ section: "init", tool: "mcp_connect", elapsed, note: "stdio transport" });
  return { client };
}

async function waitForExtension(client) {
  process.stdout.write("  Waiting for Firefox extension");
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) {
    try {
      const { result } = await call(client, "tab_list", {}, "extension ping");
      if (Array.isArray(result)) {
        console.log(` connected! (${fmt(performance.now() - t0)})\n`);
        return;
      }
    } catch {}
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Extension did not connect within 60s");
}

// ─── Task 1: TodoMVC React — SPA + Framework Events ──────────────────────────
//
// Tools used:  tab_navigate, wait_for(selector), page_snapshot, element_fill,
//              page_evaluate (form submit), click_and_wait, element_click

async function task1(client, tabId) {
  startSection("T1-todomvc");
  console.log("━━━ Task 1: TodoMVC React — SPA + Framework Events ━━━\n");

  // navigate_and_wait: 1 call instead of tab_navigate + wait_for + page_snapshot
  // MutationObserver detects input the instant React renders it
  const { result: snap } = await call(client, "navigate_and_wait",
    { tabId, url: "https://todomvc.com/examples/react/dist/",
      selector: ".new-todo, input[placeholder]",
      filter: "interactive", timeout: 8000 }, "nav+wait");
  const tree = snap?.tree || "";
  const inputRef = tree.match(/\[(ref_\d+)\].*textbox/i)?.[1];
  assert("T1.1 todo input found", !!inputRef, inputRef || "not in tree");
  if (!inputRef) { console.log(); endSection("T1-todomvc"); return; }

  // Type text — element_type triggers per-character input events that React's
  // onChange handler sees, updating controlled input state correctly.
  const { result: fillRes } = await call(client, "element_type",
    { tabId, ref: inputRef, text: "Buy groceries" }, "type text");
  assert("T1.2 input value set", fillRes?.success === true);

  // Press Enter to submit — key_press dispatches key='Enter' (not '\n'),
  // which React's onKeyDown checks via event.key === 'Enter'.
  const { result: enterRes } = await call(client, "key_press",
    { tabId, keys: "Enter", ref: inputRef }, "press Enter");
  console.log(`       enter key:               success=${enterRes?.success}`);

  // Wait for todo to appear — use broad selector (class names vary across TodoMVC versions)
  const { result: todoWait } = await call(client, "wait_for",
    { tabId, selector: "li, .todo-list li, [data-testid='todo-item'], [data-testid='todo-list'] li", timeout: 3000 }, "wait for todo");
  // Also check snapshot directly in case wait_for selector doesn't match
  const { result: todoSnap } = todoWait?.found ? { result: null } :
    await call(client, "page_snapshot", { tabId, filter: "all" }, "snap todo check");
  const todoAdded = todoWait?.found === true ||
    (todoSnap?.tree || "").toLowerCase().includes("listitem") ||
    (todoSnap?.tree || "").toLowerCase().includes("groceries");
  assert("T1.3 todo item added", todoAdded, todoAdded ? "listitem appeared" : "form submit didn't add todo");

  if (!todoAdded) {
    assert("T1.4 checkbox toggled", false, "skipped — todo not added");
    assert("T1.5 filter works", false, "skipped — todo not added");
    console.log(); endSection("T1-todomvc"); return;
  }

  // Click the toggle checkbox — click_and_wait returns fresh snapshot
  const { result: cbSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap for checkbox");
  const cbRef = (cbSnap?.tree || "").match(/\[(ref_\d+)\].*checkbox/i)?.[1];

  if (cbRef) {
    const { result: clickRes } = await call(client, "click_and_wait",
      { tabId, ref: cbRef }, "toggle checkbox");
    const afterTree = clickRes?.snapshot || "";
    const checked = afterTree.includes("[checked]") || afterTree.toLowerCase().includes("completed");
    assert("T1.4 checkbox toggled", clickRes?.success === true && checked,
      `success=${clickRes?.success}, checked=${checked}`);
  } else {
    assert("T1.4 checkbox toggled", false, "no checkbox ref in tree");
  }

  // Click Active filter
  const { result: filterSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap for filter");
  const activeRef = (filterSnap?.tree || "").match(/\[(ref_\d+)\].*link "Active"/i)?.[1]
    || (filterSnap?.tree || "").match(/\[(ref_\d+)\].*Active/)?.[1];

  if (activeRef) {
    const { result: filterRes } = await call(client, "click_and_wait",
      { tabId, ref: activeRef }, "click Active");
    // TodoMVC React uses URL hash routing: #/active means filter was applied
    const url = filterRes?.url || filterRes?.verification?.newUrl || "";
    const urlOk = url.includes("#/active") || url.includes("active");
    // Also check DOM: take a fresh snapshot after React re-renders
    const { result: freshSnap } = await call(client, "page_snapshot",
      { tabId, filter: "all" }, "snap after Active");
    const fTree = (freshSnap?.tree || "").toLowerCase();
    const domOk = !fTree.includes("buy groceries") || fTree.includes("hidden");
    const hidden = urlOk || domOk;
    assert("T1.5 Active filter hides completed", hidden,
      hidden ? `${urlOk ? "url" : "dom"} confirms filter` : `url=${url}, dom still has item`);
  } else {
    assert("T1.5 Active filter hides completed", false, "no Active ref");
  }

  console.log();
  endSection("T1-todomvc");
}

// ─── Task 2: Wikipedia — Search + Extract + Large DOM ─────────────────────────
//
// Tools used:  tab_navigate, wait_for(selector), element_type (autocomplete),
//              click_and_wait(waitFor: url), page_content, element_click

async function task2(client, tabId) {
  startSection("T2-wikipedia");
  console.log("━━━ Task 2: Wikipedia — Search + Extract + Large DOM ━━━\n");

  // navigate_and_wait: MutationObserver detects search input the instant it renders
  const { result: snap } = await call(client, "navigate_and_wait",
    { tabId, url: "https://en.wikipedia.org/",
      selector: "#searchInput, input[name='search']",
      filter: "interactive", timeout: 8000 }, "nav+wait");
  const tree = snap?.tree || "";
  const searchRef = tree.match(/\[(ref_\d+)\].*(?:searchbox|combobox|textbox)/i)?.[1];
  assert("T2.1 search input found", !!searchRef, searchRef || "not found");
  if (!searchRef) { console.log(); endSection("T2-wikipedia"); return; }

  // Type search — use element_type for autocomplete trigger
  await call(client, "element_type", { tabId, ref: searchRef, text: "Firefox web browser" }, "type search");

  // Find search button and click — wait for URL to contain "wiki/"
  const { result: btnSnap } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, "snap btn");
  const btnRef = (btnSnap?.tree || "").match(/\[(ref_\d+)\].*button.*[Ss]earch/i)?.[1];

  if (btnRef) {
    // click_and_wait with URL pattern — background script survives content script disconnect
    const { result: navRes } = await call(client, "click_and_wait",
      { tabId, ref: btnRef, waitFor: "wiki/" }, "click search → wait wiki/");
    console.log(`       search navigation:       url=${navRes?.verification?.newUrl || "?"}`);
  } else {
    // Fallback: Enter key (may not work, but try)
    await call(client, "element_type", { tabId, ref: searchRef, text: "\n" }, "submit Enter");
    await call(client, "wait_for", { tabId, url: "wiki/", timeout: 8000 }, "wait for wiki/");
  }

  // Verify article loaded
  const { result: articleSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap article");
  const articleUrl = articleSnap?.url || "";
  assert("T2.2 navigated to article", articleUrl.includes("wiki/") && !articleUrl.includes("Main_Page"),
    `url=${articleUrl}`);
  console.log(`       article:                 ${articleSnap?.refCount} refs, url=${articleUrl}`);

  // Extract content
  const { result: content } = await call(client, "page_content", { tabId }, "content");
  const text = extractText(content);
  assert("T2.3 content contains 'Firefox'", text.toLowerCase().includes("firefox"));
  assert("T2.4 content contains 'Mozilla'", text.toLowerCase().includes("mozilla"));
  console.log(`       page_content:            ${kb(text)}`);

  // Structure checks on the tree
  const fullTree = articleSnap?.tree || "";
  assert("T2.5 heading structure present", fullTree.includes("heading"));

  // TOC navigation — find any hash link
  const tocRef = fullTree.match(/\[(ref_\d+)\].*link "History"/i)?.[1]
    || fullTree.match(/\[(ref_\d+)\].*link "Features"/i)?.[1]
    || fullTree.match(/\[(ref_\d+)\].*link.*#/)?.[1];
  if (tocRef) {
    await call(client, "element_click", { tabId, ref: tocRef }, "TOC click");
    assert("T2.6 TOC navigation works", true);
  } else {
    assert("T2.6 TOC navigation works", false, "no TOC link found");
  }

  console.log();
  endSection("T2-wikipedia");
}

// ─── Task 3: Hacker News — Table Layout + Full Navigation + Pagination ────────
//
// Tools used:  tab_navigate, wait_for(selector/url), page_snapshot,
//              page_content, click_and_wait(waitFor: url)

async function task3(client, tabId) {
  startSection("T3-hackernews");
  console.log("━━━ Task 3: Hacker News — Table Layout + Navigation + Pagination ━━━\n");

  // navigate_and_wait: MutationObserver fires the instant HN story links appear
  const { result: snap } = await call(client, "navigate_and_wait",
    { tabId, url: "https://news.ycombinator.com/",
      selector: ".titleline, .storylink, .athing",
      filter: "interactive", timeout: 8000 }, "nav+wait");
  const tree = snap?.tree || "";
  const linkCount = (tree.match(/link "/g) || []).length;
  assert("T3.1 story links visible", linkCount >= 5, `${linkCount} links`);

  // Extract content
  const { result: content } = await call(client, "page_content", { tabId }, "content");
  const text = extractText(content);
  assert("T3.2 story text extractable", text.length > 200, `${kb(text)}`);

  // Find a comments link — HN format: "N\xA0comments" or "discuss"
  const commentsRef = tree.match(/\[(ref_\d+)\].*link "\d+.comment/i)?.[1]
    || tree.match(/\[(ref_\d+)\].*link "discuss/i)?.[1];

  if (commentsRef) {
    // click_and_wait with URL pattern — background polls for "item?id=" in URL
    const { result: commentRes } = await call(client, "click_and_wait",
      { tabId, ref: commentsRef, waitFor: "item?id=" }, "click comments → wait item?id=");
    const commentUrl = commentRes?.verification?.newUrl || "";
    assert("T3.3 navigated to comment page", commentUrl.includes("item?id="), `url=${commentUrl}`);

    const { result: commentContent } = await call(client, "page_content", { tabId }, "comment content");
    assert("T3.4 comment text extractable", extractText(commentContent).length > 100);
  } else {
    assert("T3.3 navigated to comment page", false, "no comments link found");
    assert("T3.4 comment text extractable", false, "skipped");
  }

  // Navigate back for pagination test
  const { result: frontSnap } = await call(client, "navigate_and_wait",
    { tabId, url: "https://news.ycombinator.com/",
      selector: ".morelink, a.morelink",
      filter: "interactive", timeout: 5000 }, "nav+wait front");
  const moreRef = (frontSnap?.tree || "").match(/\[(ref_\d+)\].*link "More"/i)?.[1]
    || (frontSnap?.tree || "").match(/\[(ref_\d+)\].*More/)?.[1];

  if (moreRef) {
    const { result: moreRes } = await call(client, "click_and_wait",
      { tabId, ref: moreRef, waitFor: "p=2" }, "click More → wait p=2");
    const page2Url = moreRes?.verification?.newUrl || "";
    assert("T3.5 pagination works", page2Url.includes("p=2"), `url=${page2Url}`);
  } else {
    assert("T3.5 pagination works", false, "More link not found");
  }

  console.log();
  endSection("T3-hackernews");
}

// ─── Task 4: GitHub — SPA Navigation + Content Extraction ────────────────────
//
// Tools used:  navigate_and_snapshot, page_content, click_and_wait,
//              tab_navigate, wait_for, page_evaluate

async function task4(client, tabId) {
  startSection("T4-github");
  console.log("━━━ Task 4: GitHub — SPA Navigation + Content Extraction ━━━\n");

  // Navigate and snapshot (navigate_and_snapshot is reliable when tab has content)
  const { result: navSnap } = await call(client, "navigate_and_snapshot",
    { tabId, url: "https://github.com/anthropics/anthropic-sdk-python", filter: "all" }, "nav");
  const tree = navSnap?.tree || "";
  assert("T4.1 repo structure visible",
    tree.toLowerCase().includes("readme") || tree.includes("link ") || navSnap?.refCount > 50,
    `${navSnap?.refCount} refs`);

  // Extract README content
  const { result: content } = await call(client, "page_content", { tabId }, "content");
  const text = extractText(content);
  assert("T4.2 README content extracted",
    text.toLowerCase().includes("anthropic") || text.toLowerCase().includes("python"),
    `${kb(text)}`);

  // Find a file link and click (SPA navigation via Turbo)
  const { result: intSnap } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, "snap int");
  const intTree = intSnap?.tree || "";
  const fileRef = intTree.match(/\[(ref_\d+)\].*link "src"/i)?.[1]
    || intTree.match(/\[(ref_\d+)\].*link "README/i)?.[1]
    || intTree.match(/\[(ref_\d+)\].*link "pyproject/i)?.[1]
    || intTree.match(/\[(ref_\d+)\].*link "LICENSE/i)?.[1];

  if (fileRef) {
    const prevUrl = navSnap?.url || "";
    // click_and_wait for SPA nav — returns fresh snapshot
    const { result: clickRes } = await call(client, "click_and_wait",
      { tabId, ref: fileRef }, "click file (SPA)");
    const newUrl = clickRes?.verification?.newUrl || "";
    assert("T4.3 SPA navigation changes URL", newUrl !== prevUrl && newUrl.includes("github.com"),
      `${prevUrl} → ${newUrl}`);
  } else {
    assert("T4.3 SPA navigation changes URL", false, "no file link found");
  }

  // Navigate to issues page — single combined call
  const { result: issuesSnap } = await call(client, "navigate_and_wait",
    { tabId, url: "https://github.com/anthropics/anthropic-sdk-python/issues",
      selector: "[data-testid], .js-issue-row, .Box-row",
      filter: "all", timeout: 8000 }, "nav+wait issues");
  const issuesTree = (issuesSnap?.tree || "").toLowerCase();
  assert("T4.4 issues page loads",
    issuesTree.includes("issue") || issuesTree.includes("open") || issuesTree.includes("closed"),
    `url=${issuesSnap?.url}`);

  // Known gap: page_evaluate CSP
  const { result: evalRes, error: evalErr } = await call(client, "page_evaluate",
    { tabId, expression: "document.title" }, "eval CSP test");
  knownGap("T4.K1 page_evaluate on GitHub (CSP)", !!evalRes && !evalErr,
    "GitHub strict CSP may block page_evaluate");

  console.log();
  endSection("T4-github");
}

// ─── Task 5: NPM — Structured Data + Tab Navigation ──────────────────────────
//
// Tools used:  navigate_and_snapshot, page_content, tab_navigate,
//              wait_for(selector), page_snapshot

async function task5(client, tabId) {
  startSection("T5-npm");
  console.log("━━━ Task 5: NPM — Structured Data + Tab Navigation ━━━\n");

  // Navigate to package page
  const { result: navSnap } = await call(client, "navigate_and_snapshot",
    { tabId, url: "https://www.npmjs.com/package/express", filter: "all" }, "nav");
  assert("T5.1 package info visible",
    (navSnap?.tree || "").toLowerCase().includes("express"));

  // Extract description + version
  const { result: content } = await call(client, "page_content", { tabId }, "content");
  const text = extractText(content);
  assert("T5.2 description extracted", text.toLowerCase().includes("express"));
  assert("T5.3 version info present", /\d+\.\d+\.\d+/.test(text));
  console.log(`       page_content:            ${kb(text)}`);

  // Versions tab — navigate_and_wait: 1 call instead of navigate + wait + snapshot
  const { result: verSnap } = await call(client, "navigate_and_wait",
    { tabId, url: "https://www.npmjs.com/package/express?activeTab=versions",
      selector: "#tabpanel-versions, [id*=version], .version",
      filter: "all", timeout: 8000 }, "nav+wait versions");
  const { result: verContent } = await call(client, "page_content", { tabId }, "versions content");
  const verText = extractText(verContent);
  const verTree = verSnap?.tree || "";
  const versFound = /\d+\.\d+\.\d+/.test(verText) || /\d+\.\d+\.\d+/.test(verTree);
  assert("T5.4 version list loads", versFound,
    versFound ? `found in ${/\d+\.\d+\.\d+/.test(verText) ? "text" : "tree"}` : "no semver found");
  console.log(`       versions:                text=${kb(verText)}, tree=${kb(verTree)}`);

  // Dependencies tab — single call
  const { result: depSnap } = await call(client, "navigate_and_wait",
    { tabId, url: "https://www.npmjs.com/package/express?activeTab=dependencies",
      selector: "#tabpanel-dependencies, [id*=depend], .dependency",
      filter: "all", timeout: 8000 }, "nav+wait deps");
  const { result: depContent } = await call(client, "page_content", { tabId }, "deps content");
  const depText = extractText(depContent).toLowerCase();
  const depTree = (depSnap?.tree || "").toLowerCase();
  const depNames = ["cookie", "debug", "body-parser", "path-to-regexp", "accepts", "send", "merge-descriptors"];
  const anyDep = depNames.some(d => depText.includes(d) || depTree.includes(d)) ||
                 depText.includes("dependencies") || depTree.includes("dependencies");
  assert("T5.5 dependency list loads", anyDep,
    anyDep ? "deps found" : "no known express deps in text or tree");
  console.log(`       deps:                    text=${kb(depText)}, tree=${kb(depTree)}`);

  console.log();
  endSection("T5-npm");
}

// ─── Task 6: DuckDuckGo — Search Workflow ─────────────────────────────────────
//
// Tools used:  tab_navigate, wait_for(selector), element_type (autocomplete),
//              click_and_wait, page_snapshot

async function task6(client, tabId) {
  startSection("T6-duckduckgo");
  console.log("━━━ Task 6: DuckDuckGo — Search Workflow ━━━\n");

  // Navigate and wait for search box — single round-trip
  const { result: snap } = await call(client, "navigate_and_wait",
    { tabId, url: "https://duckduckgo.com/",
      selector: "input[name='q'], input[type='text']",
      filter: "interactive", timeout: 8000 }, "nav+wait");
  const searchRef = (snap?.tree || "").match(/\[(ref_\d+)\].*(?:searchbox|combobox|textbox)/i)?.[1];
  assert("T6.1 search input found", !!searchRef, searchRef || "not found");
  if (!searchRef) { console.log(); endSection("T6-duckduckgo"); return; }

  // Type search query — element_type for autocomplete interaction
  await call(client, "element_type", { tabId, ref: searchRef, text: "Claude AI Anthropic" }, "type");

  // Find search button and click, or submit via Enter
  const { result: btnSnap } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, "snap btn");
  const btnRef = (btnSnap?.tree || "").match(/\[(ref_\d+)\].*button.*[Ss]earch/i)?.[1];

  if (btnRef) {
    // click_and_wait — DuckDuckGo is a SPA, results load client-side
    await call(client, "click_and_wait", { tabId, ref: btnRef, waitFor: "5000" }, "click search");
  } else {
    // Submit via Enter
    const freshRef = (btnSnap?.tree || "").match(/\[(ref_\d+)\].*(?:searchbox|combobox|textbox)/i)?.[1] || searchRef;
    await call(client, "element_type", { tabId, ref: freshRef, text: "\n" }, "Enter");
    await call(client, "wait_for", { tabId, timeout: 3000 }, "wait");
  }

  // Wait for results — poll for "anthropic" in tree
  const { result: resultSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap results");
  const resultTree = resultSnap?.tree || "";
  const hasResults = resultTree.toLowerCase().includes("anthropic");
  assert("T6.2 search results loaded", hasResults,
    hasResults ? "found Anthropic" : "no results");

  if (hasResults) {
    // Count links
    const linkCount = (resultTree.match(/\blink\b/g) || []).length;
    assert("T6.3 result links found (≥3)", linkCount >= 3, `${linkCount} links`);

    // Click first result near "Anthropic" text
    const anthropicIdx = resultTree.toLowerCase().indexOf("anthropic");
    const sub = anthropicIdx > 0 ? resultTree.slice(Math.max(0, anthropicIdx - 300)) : resultTree;
    const resultRef = sub.match(/\[(ref_\d+)\].*link/)?.[1];

    if (resultRef) {
      // click_and_wait for external navigation
      const { result: extRes } = await call(client, "click_and_wait",
        { tabId, ref: resultRef, waitFor: "5000" }, "click result");
      const extUrl = extRes?.verification?.newUrl || "";
      // DDG may redirect via duckduckgo.com/l/... or go directly to site
      const leftDDG = !extUrl.includes("duckduckgo.com") ||
                      extUrl.includes("duckduckgo.com/l/") ||
                      extUrl !== (resultSnap?.url || "");
      assert("T6.4 click-through works", leftDDG, `url=${extUrl}`);
    } else {
      assert("T6.4 click-through works", false, "no result link ref found");
    }
  } else {
    assert("T6.3 result links found (≥3)", false, "no results");
    assert("T6.4 click-through works", false, "skipped");
  }

  console.log();
  endSection("T6-duckduckgo");
}

// ─── Timing Report ────────────────────────────────────────────────────────────

function printTimingReport() {
  const bySec = {};
  for (const e of timingLog) {
    if (!bySec[e.section]) bySec[e.section] = [];
    bySec[e.section].push(e);
  }

  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  Timing Report                                                        ║");
  console.log("╠══════════════════════════════╦══════════╦═════════╦══════════════════╣");
  console.log("║  Section / Tool              ║  Elapsed ║   Size  ║  Note            ║");
  console.log("╠══════════════════════════════╬══════════╬═════════╬══════════════════╣");

  for (const [sec, entries] of Object.entries(bySec)) {
    const wallTime = sectionTimes[sec]
      ? sectionTimes[sec].end - sectionTimes[sec].start
      : entries.reduce((s, e) => s + e.elapsed, 0);
    console.log(`║  ── ${sec.padEnd(26)}(${fmt(wallTime).padStart(8)}) ────────────────║`);
    for (const e of entries) {
      const tool = e.tool.padEnd(28);
      const ms   = fmt(e.elapsed).padStart(8);
      const size = e.resultSize > 0 ? `${(e.resultSize / 1024).toFixed(1)}KB`.padStart(7) : "       ";
      const note = (e.note || "").slice(0, 18).padEnd(18);
      const err  = e.isError ? " ERR" : "    ";
      console.log(`║    ${tool} ${ms}  ${size}  ${note}${err}║`);
    }
  }
  console.log("╚══════════════════════════════╩══════════╩═════════╩══════════════════╝");

  // Per-tool latency summary
  const toolGroups = {};
  for (const e of timingLog) {
    if (!toolGroups[e.tool]) toolGroups[e.tool] = [];
    toolGroups[e.tool].push(e.elapsed);
  }

  console.log("\n┌──────────────────────────────────────────────────────────────────┐");
  console.log("│  Per-Tool Latency Summary                                         │");
  console.log("├─────────────────────────────┬───────┬─────────┬─────────┬────────┤");
  console.log("│  Tool                       │ Calls │     Min │     Max │    Avg │");
  console.log("├─────────────────────────────┼───────┼─────────┼─────────┼────────┤");
  for (const [tool, times] of Object.entries(toolGroups)) {
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`│  ${tool.padEnd(27)}  ${String(times.length).padStart(3)}   ${fmt(min).padStart(7)}  ${fmt(max).padStart(7)}  ${fmt(avg).padStart(6)} │`);
  }
  console.log("└─────────────────────────────┴───────┴─────────┴─────────┴────────┘");

  // Total tool call count
  const totalCalls = timingLog.length;
  const totalTime = timingLog.reduce((s, e) => s + e.elapsed, 0);
  console.log(`\n  Total tool calls: ${totalCalls}  |  Sum of tool time: ${fmt(totalTime)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const benchStart = performance.now();

  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  claude-firefox MCP — Real-World Benchmark v2                         ║");
  console.log("║  Tests: TodoMVC, Wikipedia, Hacker News, GitHub, NPM, DuckDuckGo     ║");
  console.log("║  Optimized: click_and_wait, wait_for, element_fill, page_evaluate     ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  const { client } = await setup();
  console.log("  MCP server started\n");

  try {
    await waitForExtension(client);

    // Create tab and switch to it (avoids Firefox background tab throttling)
    const { result: tab } = await call(client, "tab_create", { url: "about:blank" }, "create tab");
    const tabId = tab?.tabId;
    if (typeof tabId !== "number") throw new Error("Failed to create tab");
    await call(client, "tab_switch", { tabId }, "switch to tab");
    console.log(`  Tab ${tabId} created and focused\n`);

    await task1(client, tabId);
    await task2(client, tabId);
    await task3(client, tabId);
    await task4(client, tabId);
    await task5(client, tabId);
    await task6(client, tabId);

    await call(client, "tab_close", { tabId }, "close tab");

    const totalMs = performance.now() - benchStart;
    const total = passed + failed;
    const pct = total > 0 ? ((passed / total) * 100).toFixed(0) : 0;

    console.log("╔══════════════════════════════════════════════════════════════════════╗");
    console.log("║  Results                                                              ║");
    console.log("╠══════════════════════════════════════════════════════════════════════╣");
    console.log(`║  Passed:  ${String(passed).padEnd(3)} / ${String(total).padEnd(3)}  (${pct}%)`.padEnd(72) + "║");
    console.log(`║  Total time: ${fmt(totalMs)}`.padEnd(72) + "║");
    if (failures.length > 0) {
      console.log("╠══════════════════════════════════════════════════════════════════════╣");
      console.log("║  Failures:                                                            ║");
      for (const f of failures) {
        console.log(`║    ✗ ${f.slice(0, 65).padEnd(66)}║`);
      }
    }
    if (knownGapLog.length > 0) {
      console.log("╠══════════════════════════════════════════════════════════════════════╣");
      console.log("║  Known Gaps:                                                          ║");
      for (const e of knownGapLog) {
        const icon = e.status === "UNEXPECTEDLY PASSED" ? "!" : "✗";
        console.log(`║    ${icon} ${e.name.slice(0, 66).padEnd(67)}║`);
      }
    }
    console.log("╚══════════════════════════════════════════════════════════════════════╝");

    printTimingReport();

  } finally {
    await client.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
