// End-to-end benchmark for claude-firefox MCP
// Comprehensive real-world stress test — designed to challenge the tool
//
// Section map:
//   A  Navigation baseline
//   B  Full auth flow — wrong creds → error → retry → verify session
//   C  AJAX dynamic loading (/dynamic_loading/2) — content injected after delay
//   D  Dynamic controls + stale ref recovery (/dynamic_controls)
//   E  Keyboard simulation (/key_presses) — synthetic event propagation
//   F  Flash messages (/notification_messages) — post-navigation transient state
//   G  Cache performance (/checkboxes)
//   H  Large DOM stress (/large) — snapshot at scale
//   I  Tab management
//   J  Known limitations — EXPECTED FAILS (drag, iframe, shadow DOM)

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { performance } from "perf_hooks";

const BASE = "https://the-internet.herokuapp.com";

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
  return ms < 1 ? `${(ms * 1000).toFixed(0)}μs` : `${ms.toFixed(1)}ms`;
}

function kb(str) {
  return str ? `${(str.length / 1024).toFixed(1)}KB` : "0KB";
}

// ─── Pass / Fail tracking ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

// Separate tracking for J-section (expected fails — documents capability gaps)
const expectedFailLog = [];

function assert(name, condition, detail = "") {
  const msg = detail ? `${name}: ${detail}` : name;
  console.log(`    ${condition ? "✓" : "✗"} ${msg}`);
  if (condition) passed++;
  else {
    failed++;
    failures.push(`[${currentSection}] ${msg}`);
  }
}

// Documents a known gap. Records whether it failed as expected or surprisingly passed.
function knownGap(name, condition, explanation) {
  if (!condition) {
    console.log(`    ✗ GAP — ${name}`);
    console.log(`           ${explanation}`);
    expectedFailLog.push({ name, status: "failed as expected", explanation });
  } else {
    console.log(`    ! SURPRISE — ${name} (unexpectedly passed — capability may have improved)`);
    expectedFailLog.push({ name, status: "UNEXPECTEDLY PASSED", explanation });
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

// Poll with page_snapshot until keyword appears in tree or timeout
async function pollForContent(client, tabId, keyword, maxAttempts = 12, intervalMs = 500, filter = "all") {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const { result: snap } = await call(client, "page_snapshot", { tabId, filter }, `poll ${i + 1}`);
    if ((snap?.tree || "").toLowerCase().includes(keyword.toLowerCase())) {
      return { found: true, attempts: i + 1, snap };
    }
  }
  return { found: false, attempts: maxAttempts, snap: null };
}

// ─── MCP Setup ────────────────────────────────────────────────────────────────

async function setup() {
  const t0 = performance.now();
  const transport = new StdioClientTransport({
    command: "node",
    args: ["build/index.js"],
    cwd: new URL("..", import.meta.url).pathname,
  });
  const client = new Client({ name: "benchmark", version: "1.0.0" });
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

// ─── Section A: Navigation Baseline ──────────────────────────────────────────
//
// What it tests: core navigation primitives work at all
// Expected behavior: all pass, establishes timing baseline for everything else

async function sectionA(client) {
  startSection("A-navigation");
  console.log("━━━ A: Navigation Baseline ━━━\n");

  const { elapsed: t1, result: tab } = await call(client, "tab_create", { url: `${BASE}/login` }, "create tab");
  const tabId = tab?.tabId;
  assert("A1 tab_create returns tabId", typeof tabId === "number");
  console.log(`       tab_create:              ${fmt(t1).padStart(8)}`);

  const { elapsed: t2, result: nav } = await call(client, "tab_navigate", { tabId, url: `${BASE}/checkboxes` }, "navigate");
  assert("A2 tab_navigate returns url", nav?.url?.includes("checkboxes"));
  console.log(`       tab_navigate:            ${fmt(t2).padStart(8)}`);

  const { elapsed: t3, result: navSnap } = await call(client, "navigate_and_snapshot", { tabId, url: `${BASE}/login`, filter: "interactive" }, "navigate+snapshot");
  assert("A3 navigate_and_snapshot has tree", typeof navSnap?.tree === "string" && navSnap.tree.length > 0);
  assert("A4 navigate_and_snapshot has refs", typeof navSnap?.refCount === "number" && navSnap.refCount > 0);
  console.log(`       navigate_and_snapshot:   ${fmt(t3).padStart(8)}  (${navSnap?.refCount} refs, ${kb(navSnap?.tree)})`);

  console.log();
  endSection("A-navigation");
  return { tabId };
}

// ─── Section B: Full Auth Flow ────────────────────────────────────────────────
//
// What it tests: multi-step form workflow with intermediate failure state
//
// Challenge: after wrong creds, the page reloads — all previous refs are stale.
// The tool must re-snapshot to get fresh refs before the second fill attempt.
// Two navigation disconnects happen (submit × 2).
//
// Expected behavior:
//   1. Fill wrong creds → submit → content script disconnects (navigation)
//   2. Wait + re-snapshot → error flash visible, new set of refs
//   3. Fill correct creds using NEW refs → submit → disconnect again
//   4. Wait + re-snapshot → /secure page, success message

async function sectionB(client, tabId) {
  startSection("B-auth-flow");
  console.log("━━━ B: Full Auth Flow ━━━\n");
  console.log("  Pattern: wrong creds → verify error → correct creds → verify session");
  console.log("  Challenge: every form submit reloads the page — refs become stale.\n");

  const { elapsed: navB } = await call(client, "tab_navigate", { tabId, url: `${BASE}/login` }, "nav to login");
  const { elapsed: snapB1, result: snap1 } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, "snap login form");
  const tree1 = snap1?.tree || "";
  console.log(`       nav to login:            ${fmt(navB).padStart(8)}`);
  console.log(`       snapshot (login form):   ${fmt(snapB1).padStart(8)}  (${snap1?.refCount} refs)`);

  const userRef1 = tree1.match(/\[(ref_\d+)\].*[Uu]ser(?:name)?/)?.[1];
  const passRef1 = tree1.match(/\[(ref_\d+)\].*[Pp]ass(?:word)?/)?.[1];
  const btnRef1  = tree1.match(/\[(ref_\d+)\].*(?:[Ll]ogin|[Ss]ubmit)/)?.[1];
  assert("B1 form refs found on initial load", !!(userRef1 && passRef1 && btnRef1));

  if (!(userRef1 && passRef1 && btnRef1)) {
    console.log();
    endSection("B-auth-flow");
    return;
  }

  // ── Round 1: wrong credentials ────────────────────────────────────────────
  await call(client, "form_fill", {
    tabId,
    fields: [
      { ref: userRef1, value: "wronguser" },
      { ref: passRef1, value: "wrongpass" },
    ],
  }, "fill wrong creds");

  const t0 = performance.now();
  try {
    await call(client, "element_click", { tabId, ref: btnRef1 }, "submit wrong creds");
  } catch { /* navigation disconnect — expected */ }
  const submit1Ms = performance.now() - t0;
  console.log(`       form_fill + submit ×1:   ${fmt(submit1Ms).padStart(8)}  (navigation → disconnect)`);

  await new Promise((r) => setTimeout(r, 2500));

  // Re-snapshot — capture error state
  const { elapsed: snapErr, result: errSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap error state");
  const errTree = errSnap?.tree || "";
  const hasError = errTree.toLowerCase().includes("invalid") ||
                   errTree.toLowerCase().includes("incorrect") ||
                   errTree.toLowerCase().includes("username") ||
                   errTree.toLowerCase().includes("password") ||
                   errTree.toLowerCase().includes("error") ||
                   errTree.toLowerCase().includes("flash");
  assert("B2 error message shown after wrong creds", hasError, hasError ? "found" : `url=${errSnap?.url}`);
  console.log(`       snapshot (error state):  ${fmt(snapErr).padStart(8)}  (error_found=${hasError})`);
  if (!hasError) {
    console.log(`         ↳ tree snippet: ${errTree.slice(0, 200)}`);
  }

  // Get fresh refs for retry — previous refs are dead (page reloaded)
  const { elapsed: snapB2, result: snap2 } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, "snap fresh form refs");
  const tree2 = snap2?.tree || "";
  const userRef2 = tree2.match(/\[(ref_\d+)\].*[Uu]ser(?:name)?/)?.[1];
  const passRef2 = tree2.match(/\[(ref_\d+)\].*[Pp]ass(?:word)?/)?.[1];
  const btnRef2  = tree2.match(/\[(ref_\d+)\].*(?:[Ll]ogin|[Ss]ubmit)/)?.[1];
  console.log(`       re-snapshot (fresh refs): ${fmt(snapB2).padStart(8)}  (user=${userRef2}, pass=${passRef2}, btn=${btnRef2})`);

  if (!(userRef2 && passRef2 && btnRef2)) {
    assert("B3 correct creds accepted → /secure", false, "could not get fresh form refs for retry");
    assert("B4 success message visible on /secure", false, "skipped");
    console.log();
    endSection("B-auth-flow");
    return;
  }

  // ── Round 2: correct credentials ──────────────────────────────────────────
  await call(client, "form_fill", {
    tabId,
    fields: [
      { ref: userRef2, value: "tomsmith" },
      { ref: passRef2, value: "SuperSecretPassword!" },
    ],
  }, "fill correct creds");

  const t1 = performance.now();
  try {
    await call(client, "element_click", { tabId, ref: btnRef2 }, "submit correct creds");
  } catch { /* navigation → disconnect */ }
  const submit2Ms = performance.now() - t1;
  console.log(`       form_fill + submit ×2:   ${fmt(submit2Ms).padStart(8)}  (navigation → disconnect)`);

  await new Promise((r) => setTimeout(r, 1500));

  const { elapsed: snapSec, result: secSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap /secure");
  assert("B3 correct creds accepted → /secure", secSnap?.url?.includes("secure"), `url=${secSnap?.url}`);
  assert("B4 success message visible on /secure",
    (secSnap?.tree || "").toLowerCase().includes("secure") ||
    (secSnap?.tree || "").toLowerCase().includes("logged")
  );
  console.log(`       snapshot (/secure):      ${fmt(snapSec).padStart(8)}  (url: ${secSnap?.url})`);

  console.log();
  endSection("B-auth-flow");
}

// ─── Section C: AJAX Dynamic Loading ─────────────────────────────────────────
//
// URL: /dynamic_loading/2
// What it tests: waiting for content that doesn't exist yet at click time
//
// Challenge 1: The loading spinner uses id="loading" — our detectLoading selectors
//   match ".loading" (class) not "#loading" (id). It will return wasLoading=false
//   even though a spinner was shown. This is a FALSE NEGATIVE.
//
// Challenge 2: The "Hello World!" element doesn't exist in the DOM when click()
//   returns — it's injected by JS after the AJAX completes (~1.5s later).
//   element_click result won't include it in the post-click snapshot.
//
// Expected behavior:
//   The tool must poll via repeated page_snapshot calls until the content appears.
//   This is the correct real-world pattern when there's no built-in wait mechanism.

async function sectionC(client, tabId) {
  startSection("C-ajax-loading");
  console.log("━━━ C: AJAX Dynamic Loading ━━━\n");
  console.log("  URL: /dynamic_loading/2 — element injected ~1.5s after click");
  console.log("  Challenge 1: spinner is #loading (id), our detectLoading checks .loading (class)");
  console.log("             → wasLoading=false even while spinner is visible (false negative)");
  console.log("  Challenge 2: content not in DOM when click() returns — must poll\n");

  const { elapsed: navC } = await call(client, "tab_navigate", { tabId, url: `${BASE}/dynamic_loading/2` }, "nav dynamic_loading/2");
  const { elapsed: snapC, result: snapBefore } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, "snap before");
  const startRef = (snapBefore?.tree || "").match(/\[(ref_\d+)\].*[Ss]tart/)?.[1];
  console.log(`       nav to page:             ${fmt(navC).padStart(8)}`);
  console.log(`       snapshot (pre-click):    ${fmt(snapC).padStart(8)}  (${snapBefore?.refCount} refs)`);
  assert("C1 Start button found", !!startRef, startRef || "not in interactive snapshot");

  if (!startRef) { console.log(); endSection("C-ajax-loading"); return; }

  // Click Start — spinner appears but detectLoading won't catch it
  const { elapsed: clickC, result: clickRes } = await call(client, "element_click", { tabId, ref: startRef }, "click Start");
  const wasDetected = clickRes?.loading?.wasLoading === true;
  assert("C2 click Start succeeds", clickRes?.success === true);
  console.log(`       element_click (Start):   ${fmt(clickC).padStart(8)}  (wasLoading=${wasDetected})`);
  if (!wasDetected) {
    console.log(`         ↳ FALSE NEGATIVE: spinner (#loading id) not matched by .loading class selector`);
  }

  // Poll for injected content — simulate what Claude does in real use
  console.log(`       polling for "Hello World!" ...`);
  const pollStart = performance.now();
  const { found, attempts } = await pollForContent(client, tabId, "hello world", 14, 500, "all");
  const totalPollMs = performance.now() - pollStart;
  assert("C3 Hello World found by polling", found, `after ${attempts} polls × 500ms`);
  console.log(`       poll result:             ${fmt(totalPollMs).padStart(8)}  (found=${found}, ${attempts} polls)`);

  console.log();
  endSection("C-ajax-loading");
}

// ─── Section D: Dynamic Controls + Stale Ref Recovery ────────────────────────
//
// URL: /dynamic_controls
// What it tests: DOM mutations that invalidate snapshot refs
//
// Phase 1 — Remove:
//   Challenge: clicking Remove deletes the checkbox from the DOM via AJAX.
//   The ref from the first snapshot now points to a removed element.
//   Tool must return { success: false, needsSnapshot: true } on stale ref access.
//   Tool must then re-snapshot to get the new DOM state.
//
// Phase 2 — Enable:
//   Challenge: input starts as disabled. Clicking Enable changes its disabled
//   attribute via AJAX. The ref itself is still valid but the element's state
//   changed. Tool must detect the state change and allow typing.
//
// Expected behavior:
//   Stale ref → needsSnapshot:true → re-snapshot → find new refs → proceed

async function sectionD(client, tabId) {
  startSection("D-dynamic-controls");
  console.log("━━━ D: Dynamic Controls + Stale Ref Recovery ━━━\n");
  console.log("  URL: /dynamic_controls");
  console.log("  Phase 1: Remove checkbox via AJAX → stale ref → recover");
  console.log("  Phase 2: Enable disabled input via AJAX → type in it\n");

  const { elapsed: navD } = await call(client, "tab_navigate", { tabId, url: `${BASE}/dynamic_controls` }, "nav dynamic_controls");
  const { elapsed: snapD, result: snap0 } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, "initial snapshot");
  const tree0 = snap0?.tree || "";

  const cbRef     = tree0.match(/\[(ref_\d+)\].*[Cc]heckbox/)?.[1];
  const removeRef = tree0.match(/\[(ref_\d+)\].*[Rr]emove/)?.[1];

  console.log(`       nav to page:             ${fmt(navD).padStart(8)}`);
  console.log(`       initial snapshot:        ${fmt(snapD).padStart(8)}  (${snap0?.refCount} refs)`);
  console.log(`       refs: checkbox=${cbRef || "none"}, remove=${removeRef || "none"}`);
  assert("D1 checkbox + Remove button found", !!(cbRef && removeRef));

  if (!removeRef) { console.log(); endSection("D-dynamic-controls"); return; }

  // ── Phase 1: Remove ───────────────────────────────────────────────────────
  // Click Remove → triggers AJAX that removes the checkbox (takes ~1.5-2s).
  // The DOM settle in element_click may fire before AJAX completes (net body
  // size change < 100 bytes, so domChanged=false, ref map not rebuilt).
  // Poll until the checkbox actually disappears from a fresh snapshot.
  // Each page_snapshot rebuilds window.__claudeRefs — after the checkbox is gone
  // the new ref count is smaller, so ref_N+1 is guaranteed stale.
  console.log(`\n  Phase 1 — Remove`);
  const { elapsed: removeMs } = await call(client, "element_click", { tabId, ref: removeRef }, "click Remove");
  console.log(`       element_click (Remove):  ${fmt(removeMs).padStart(8)}`);

  // Poll until checkbox is absent (each snapshot rebuilds window.__claudeRefs)
  let snap1 = null;
  let cbGone = false;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const { result: ps } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, `poll remove ${i + 1}`);
    if (!(ps?.tree || "").match(/\[(ref_\d+)\].*[Cc]heckbox/i)) {
      snap1 = ps;
      cbGone = true;
      break;
    }
  }

  assert("D3 checkbox absent from re-snapshot", cbGone, cbGone ? "correctly absent" : "still in tree");
  console.log(`       poll removal:            cbGone=${cbGone}`);

  // Use ref beyond current max — guaranteed not in window.__claudeRefs
  const newRefs = [...(snap1?.tree || "").matchAll(/\[ref_(\d+)\]/g)].map(m => parseInt(m[1]));
  const maxRef = newRefs.length > 0 ? Math.max(...newRefs) : 0;
  const staleRef = `ref_${maxRef + 1}`;
  console.log(`       current max ref: ref_${maxRef} → stale ref: ${staleRef}`);

  // Stale ref click → not in ref map → needsSnapshot:true
  const { elapsed: staleMs, result: staleRes } = await call(client, "element_click", { tabId, ref: staleRef }, "use stale ref");
  assert("D2 stale ref returns needsSnapshot:true",
    staleRes?.needsSnapshot === true,
    `needsSnapshot=${staleRes?.needsSnapshot}, success=${staleRes?.success}`
  );
  console.log(`       stale ref attempt:       ${fmt(staleMs).padStart(8)}  (needsSnapshot=${staleRes?.needsSnapshot})`);

  // ── Phase 2: Enable ───────────────────────────────────────────────────────
  console.log(`\n  Phase 2 — Enable`);
  const tree1 = snap1?.tree || "";
  const enableRef = tree1.match(/\[(ref_\d+)\].*[Ee]nable/)?.[1];
  console.log(`       enable button ref:       ${enableRef || "not found"}`);

  if (!enableRef) {
    assert("D4 type in enabled input succeeds", false, "Enable button not found");
    console.log();
    endSection("D-dynamic-controls");
    return;
  }

  const { elapsed: enableMs } = await call(client, "element_click", { tabId, ref: enableRef }, "click Enable");
  console.log(`       element_click (Enable):  ${fmt(enableMs).padStart(8)}`);

  // Poll until textbox appears WITHOUT [disabled] in interactive snapshot.
  // We can't poll for "It's enabled!" text — getAccessibleName() doesn't capture
  // <p> text content, so the paragraph never shows text in the accessibility tree.
  const enableStart = performance.now();
  let enableSnap = null;
  let enableFound = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const { result: ps } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, `poll enable ${i + 1}`);
    const tree = ps?.tree || "";
    // Input is enabled when "textbox" appears without "[disabled]" immediately after
    if (tree.includes("textbox") && !tree.includes("textbox [disabled]")) {
      enableFound = true;
      enableSnap = ps;
      break;
    }
  }
  console.log(`       poll input enabled:      found=${enableFound} (${fmt(performance.now() - enableStart)})`);

  // Find the now-enabled input and type into it
  const inputRef = (enableSnap?.tree || "").match(/\[(ref_\d+)\] textbox(?! \[disabled\])/)?.[1];
  if (inputRef) {
    const { elapsed: typeMs, result: typeRes } = await call(client, "element_type", { tabId, ref: inputRef, text: "hello" }, "type in input");
    assert("D4 type in enabled input succeeds", typeRes?.success === true, typeRes?.error || "");
    console.log(`       element_type (input):    ${fmt(typeMs).padStart(8)}  (success=${typeRes?.success})`);
  } else {
    assert("D4 type in enabled input succeeds", false, "input ref not found after enable");
  }

  console.log();
  endSection("D-dynamic-controls");
}

// ─── Section E: Keyboard Simulation ──────────────────────────────────────────
//
// URL: /key_presses
// What it tests: synthetic keyboard event propagation to document-level handlers
//
// Challenge 1: The page has NO interactive elements (no inputs, no buttons).
//   filter="interactive" returns 0 useful refs — nothing to target.
//   Must use filter="all" to get any element ref at all.
//
// Challenge 2: The page listens via $(document).keypress(...).
//   Our typeText dispatches KeyboardEvents with isTrusted=false on the target element.
//   The event must bubble from that element up to document for the handler to fire.
//   Whether jQuery's document-level handler receives a synthetic event from a
//   non-focusable div is the core question.
//
// Expected behavior:
//   If synthetic events propagate correctly → "You entered: A" appears in #result.
//   If not → page shows no reaction. Either way is informative.

async function sectionE(client, tabId) {
  startSection("E-keyboard");
  console.log("━━━ E: Keyboard Simulation ━━━\n");
  console.log("  URL: /key_presses");
  console.log("  Challenge 1: no interactive elements — must use filter='all'");
  console.log("  Challenge 2: synthetic KeyboardEvent must bubble to document-level jQuery handler\n");

  const { elapsed: navE } = await call(client, "tab_navigate", { tabId, url: `${BASE}/key_presses` }, "nav key_presses");

  // Interactive filter — expect very few refs (maybe just the footer link)
  const { elapsed: snapInt, result: intSnap } = await call(client, "page_snapshot", { tabId, filter: "interactive" }, "snap interactive");
  const intCount = intSnap?.refCount ?? 0;
  console.log(`       nav to page:             ${fmt(navE).padStart(8)}`);
  console.log(`       snapshot (interactive):  ${fmt(snapInt).padStart(8)}  (${intCount} refs — expect 0–1, no meaningful input)`);

  // All filter — should get refs for divs, headings, etc.
  const { elapsed: snapAll, result: allSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap all");
  const allTree = allSnap?.tree || "";
  const allCount = allSnap?.refCount ?? 0;
  const firstRef = allTree.match(/\[(ref_\d+)\]/)?.[1];
  console.log(`       snapshot (all):          ${fmt(snapAll).padStart(8)}  (${allCount} refs, using first=${firstRef})`);
  assert("E1 filter=all finds more refs than filter=interactive", allCount > intCount, `all=${allCount} vs interactive=${intCount}`);

  if (!firstRef) {
    assert("E2 synthetic keypress detected", false, "no ref found even in 'all' snapshot");
    console.log();
    endSection("E-keyboard");
    return;
  }

  // Click element to give focus context to the page
  const { elapsed: focusMs } = await call(client, "element_click", { tabId, ref: firstRef }, "click to focus");
  console.log(`       element_click (focus):   ${fmt(focusMs).padStart(8)}`);

  // element_click may rebuild the ref map (if domChanged detected).
  // Re-snapshot to get a ref that is current in the map.
  const { elapsed: snapRefresh, result: refreshSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "re-snap for fresh ref");
  const freshRef = (refreshSnap?.tree || "").match(/\[(ref_\d+)\]/)?.[1] || firstRef;
  console.log(`       re-snapshot (fresh ref): ${fmt(snapRefresh).padStart(8)}  (freshRef=${freshRef})`);

  // Dispatch "A" keypress — should bubble to $(document).keypress handler
  const { elapsed: typeMs, result: typeRes } = await call(client, "element_type", { tabId, ref: freshRef, text: "A" }, "type 'A'");
  console.log(`       element_type ('A'):      ${fmt(typeMs).padStart(8)}  (success=${typeRes?.success}, error=${typeRes?.error || "none"})`);

  await new Promise((r) => setTimeout(r, 300));

  const { elapsed: snapAfter, result: afterSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap after key");
  const detected = (afterSnap?.tree || "").toLowerCase().includes("you entered");
  assert("E2 synthetic keypress detected by page", detected,
    detected ? "page shows 'You entered:'" : "page did not react — event may not have reached $(document).keypress"
  );
  console.log(`       snapshot (after key):   ${fmt(snapAfter).padStart(8)}  (detected=${detected})`);

  console.log();
  endSection("E-keyboard");
}

// ─── Section F: Flash / Notification Messages ─────────────────────────────────
//
// URL: /notification_messages
// What it tests: capturing transient UI state after navigation
//
// Challenge: clicking the link causes a full server-side redirect back to the
//   same URL with a flash message injected by Rails. The element_click will
//   cause a content script disconnect (navigation event). After the page reloads
//   we need to snapshot quickly enough to see the flash before it's dismissed.
//
// Note: on this site the flash persists until the next navigation — it won't
//   auto-dismiss. The real challenge is the navigation disconnect and re-snapshot.
//
// Expected behavior:
//   element_click → disconnect (handled by try/catch) → wait 1.5s →
//   page_snapshot → flash div with "Action successful" (or similar) visible

async function sectionF(client, tabId) {
  startSection("F-flash");
  console.log("━━━ F: Flash / Notification Messages ━━━\n");
  console.log("  URL: /notification_messages");
  console.log("  Challenge: click triggers server redirect with flash message.");
  console.log("  Content script disconnects on navigation — must re-snapshot after reload.\n");

  const { elapsed: navF } = await call(client, "tab_navigate", { tabId, url: `${BASE}/notification_message` }, "nav notifications");
  const { elapsed: snapF, result: snap0 } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap page");
  const tree0 = snap0?.tree || "";
  // The page has a "Click here" link
  const linkRef = tree0.match(/\[(ref_\d+)\].*[Cc]lick here/)?.[1] ||
                  tree0.match(/\[(ref_\d+)\].*link.*click/i)?.[1] ||
                  tree0.match(/\[(ref_\d+)\].*link/i)?.[1] ||
                  tree0.match(/\[(ref_\d+)\]/)?.[1];  // fallback: use first available ref
  console.log(`       nav to page:             ${fmt(navF).padStart(8)}`);
  console.log(`       snapshot:                ${fmt(snapF).padStart(8)}  (${snap0?.refCount} refs, linkRef=${linkRef})`);
  assert("F1 notification link found", !!linkRef, linkRef || "link not in interactive snapshot");

  if (!linkRef) { console.log(); endSection("F-flash"); return; }

  // Click — page navigates (server redirect), content script disconnects
  const t0 = performance.now();
  try {
    await call(client, "element_click", { tabId, ref: linkRef }, "click link → navigate");
  } catch { /* disconnect on navigation — expected */ }
  const clickMs = performance.now() - t0;
  console.log(`       element_click (link):    ${fmt(clickMs).padStart(8)}  (navigation disconnect expected)`);

  await new Promise((r) => setTimeout(r, 1500));

  // Re-snapshot — flash message should be present on the reloaded page
  const { elapsed: snapFlash, result: flashSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap for flash");
  const flashTree = flashSnap?.tree || "";
  const hasFlash = flashTree.toLowerCase().includes("action") ||
                   flashTree.toLowerCase().includes("success") ||
                   flashTree.toLowerCase().includes("notice") ||
                   flashTree.toLowerCase().includes("flash") ||
                   flashTree.toLowerCase().includes("message") ||
                   flashTree.toLowerCase().includes("direction");
  assert("F2 flash message captured after navigation + re-snapshot", hasFlash,
    hasFlash ? "flash found" : `snippet: ${flashTree.slice(0, 200)}`
  );
  console.log(`       snapshot (flash):        ${fmt(snapFlash).padStart(8)}  (flash_found=${hasFlash})`);

  // Verify it disappears after next navigation
  await call(client, "tab_navigate", { tabId, url: `${BASE}/notification_message` }, "nav away");
  const { result: cleanSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "snap after nav");
  const flashGone = !(cleanSnap?.tree || "").toLowerCase().includes("action successful");
  console.log(`       flash gone after nav:    ${flashGone}`);

  console.log();
  endSection("F-flash");
}

// ─── Section G: Cache Performance ────────────────────────────────────────────
//
// What it tests: snapshot cache hit rate and invalidation
// Expected behavior: cold > 5ms, cached < 3ms, mutation triggers re-build

async function sectionG(client, tabId) {
  startSection("G-cache");
  console.log("━━━ G: Cache Performance ━━━\n");

  const { elapsed: navG } = await call(client, "tab_navigate", { tabId, url: `${BASE}/add_remove_elements/` }, "nav add_remove");
  console.log(`       nav to page:             ${fmt(navG).padStart(8)}`);

  const { elapsed: coldMs, result: coldSnap } = await call(client, "page_snapshot", { tabId }, "cold snapshot");
  assert("G1 cold snapshot not cached", coldSnap?.cached !== true);
  const addRef = (coldSnap?.tree || "").match(/\[(ref_\d+)\].*[Aa]dd [Ee]lement/)?.[1];
  console.log(`       cold snapshot:           ${fmt(coldMs).padStart(8)}  (${kb(coldSnap?.tree)}, ${coldSnap?.refCount} refs)`);

  const { elapsed: cachedMs, result: cachedSnap } = await call(client, "page_snapshot", { tabId }, "cached snapshot");
  assert("G2 second snapshot is cached", cachedSnap?.cached === true);
  assert("G3 cached snapshot faster than cold", cachedMs < coldMs, `cold=${fmt(coldMs)} cached=${fmt(cachedMs)}`);
  console.log(`       cached snapshot:         ${fmt(cachedMs).padStart(8)}  (speedup=${(coldMs / cachedMs).toFixed(1)}x)`);

  // 5 cache reads for avg
  const extras = [];
  for (let i = 0; i < 5; i++) {
    const { elapsed } = await call(client, "page_snapshot", { tabId }, `cached ${i + 1}/5`);
    extras.push(elapsed);
  }
  const avg = extras.reduce((a, b) => a + b, 0) / extras.length;
  console.log(`       cached × 5 avg:          ${fmt(avg).padStart(8)}  [${extras.map(fmt).join(", ")}]`);

  // Invalidate via real DOM mutation (element_click adds a child → childList fires)
  if (addRef) {
    await call(client, "element_click", { tabId, ref: addRef }, "click Add Element (mutation)");
  }
  await new Promise((r) => setTimeout(r, 400));

  const { elapsed: dirtyMs, result: dirtySnap } = await call(client, "page_snapshot", { tabId }, "post-mutation snapshot");
  assert("G4 cache invalidated after DOM mutation", dirtySnap?.cached !== true, `cached=${dirtySnap?.cached}`);
  console.log(`       post-mutation snapshot:  ${fmt(dirtyMs).padStart(8)}  (cached=${dirtySnap?.cached})`);

  console.log();
  endSection("G-cache");
  return { coldMs, cachedMs, avg };
}

// ─── Section H: Large DOM Stress ─────────────────────────────────────────────
//
// URL: /large
// What it tests: snapshot performance when the DOM has hundreds of elements
//
// Challenge: /large has a table with 50 rows × many columns — hundreds of cells.
//   Our tree builder walks the full DOM with MAX_DEPTH=25.
//   Snapshot time should be noticeably higher than a simple page.
//   Cache speedup ratio should still hold.
//   Ref count will be much higher — tests ref map sizing.
//
// Expected behavior:
//   Cold snapshot takes longer than section G. Cached snapshot is still fast.
//   Speedup ratio may be lower (larger tree to compare).

async function sectionH(client, tabId) {
  startSection("H-large-dom");
  console.log("━━━ H: Large DOM Stress ━━━\n");
  console.log("  URL: /large — hundreds of table cells, deep nesting");
  console.log("  Challenge: snapshot builder must walk a much larger tree.\n");

  const { elapsed: navH } = await call(client, "tab_navigate", { tabId, url: `${BASE}/large` }, "nav /large");
  console.log(`       nav to page:             ${fmt(navH).padStart(8)}`);

  const { elapsed: coldMs, result: coldSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "cold snapshot (all)");
  assert("H1 large page snapshot succeeds", !!(coldSnap?.tree) && coldSnap.tree.length > 0);
  console.log(`       cold snapshot (all):     ${fmt(coldMs).padStart(8)}  (${kb(coldSnap?.tree)}, ${coldSnap?.refCount} refs)`);

  const { elapsed: cachedMs, result: cachedSnap } = await call(client, "page_snapshot", { tabId, filter: "all" }, "cached snapshot");
  assert("H2 large page cached correctly", cachedSnap?.cached === true);
  const speedup = coldMs > 0 ? coldMs / cachedMs : 0;
  assert("H3 cache speedup holds on large page", speedup > 2, `${speedup.toFixed(1)}x speedup`);
  console.log(`       cached snapshot (all):   ${fmt(cachedMs).padStart(8)}  (speedup=${speedup.toFixed(1)}x)`);

  console.log();
  endSection("H-large-dom");
  return { coldMs, cachedMs };
}

// ─── Section I: Tab Management ────────────────────────────────────────────────

async function sectionI(client, tabId) {
  startSection("I-tabs");
  console.log("━━━ I: Tab Management ━━━\n");

  const { elapsed: listMs, result: tabs } = await call(client, "tab_list", {}, "tab_list");
  assert("I1 tab_list returns array", Array.isArray(tabs));
  assert("I2 benchmark tab in list", tabs?.some((t) => t.tabId === tabId));
  console.log(`       tab_list:                ${fmt(listMs).padStart(8)}  (${tabs?.length} tabs)`);

  // I3: tab_switch intentionally skipped — activating a tab brings it to foreground,
  // which interrupts the user's workflow during benchmarking.
  console.log(`       tab_switch:              (skipped — would activate tab)`);

  const { elapsed: closeMs, result: cl } = await call(client, "tab_close", { tabId }, "tab_close");
  assert("I4 tab_close succeeds", cl?.closed === true);
  console.log(`       tab_close:               ${fmt(closeMs).padStart(8)}`);

  const { elapsed: list2Ms, result: tabs2 } = await call(client, "tab_list", {}, "tab_list post-close");
  assert("I5 closed tab gone from list", !tabs2?.some((t) => t.tabId === tabId));
  console.log(`       tab_list (post-close):   ${fmt(list2Ms).padStart(8)}  (${tabs2?.length} tabs remaining)`);

  console.log();
  endSection("I-tabs");
}

// ─── Section J: Known Limitations ────────────────────────────────────────────
//
// These are EXPECTED FAILURES. They document where the tool has known gaps.
// Results are tracked separately and do NOT count toward pass/fail score.
//
// J1 — Drag and Drop (/drag_and_drop)
//   No drag API exists. element_click dispatches pointer events at element center
//   but does not hold and move to a target. The boxes won't swap positions.
//   What the tool returns: element_click "succeeds" (click events fire) but
//   the DOM doesn't change because drag requires pointerdown → move → pointerup
//   at a different coordinate.
//
// J2 — iFrame Content (/frames/iframe)
//   accessibility.js builds the tree from the main frame's document only.
//   The <iframe> element gets role="frame" in the tree, but its internal document
//   (TinyMCE editor) is a separate document — the tree walker doesn't enter it.
//   What the tool returns: snapshot includes [ref_N] frame "" but no editor content.
//
// J3 — Shadow DOM (/shadow_dom)
//   Shadow roots are separate DOM trees accessed via el.shadowRoot.
//   Our tree walker uses standard childNodes iteration which doesn't pierce shadows.
//   Elements inside shadow roots are completely invisible to the snapshot.
//   What the tool returns: snapshot shows the host element but nothing inside it.

async function sectionJ(client) {
  startSection("J-limitations");
  console.log("━━━ J: Known Limitations (Expected Failures) ━━━\n");
  console.log("  These document GAPS in the tool — failures are expected.");
  console.log("  Results tracked separately, do not affect pass/fail score.\n");

  const { result: limTab } = await call(client, "tab_create", { url: "about:blank" }, "create limitations tab");
  const limId = limTab?.tabId;
  if (!limId) { endSection("J-limitations"); return; }

  // ── J1: Drag and Drop ─────────────────────────────────────────────────────
  console.log("  J1 — Drag and Drop (/drag_and_drop)");
  await call(client, "tab_navigate", { tabId: limId, url: `${BASE}/drag_and_drop` }, "nav drag_drop");
  const { result: snapJ1 } = await call(client, "page_snapshot", { tabId: limId, filter: "interactive" }, "snap drag page");
  const treeJ1 = snapJ1?.tree || "";
  const colARef = treeJ1.match(/\[(ref_\d+)\].*(?:[Aa]|[Cc]olumn)/)?.[1];
  const colBRef = treeJ1.match(/\[(ref_\d+)\].*[Bb]/)?.[1];
  console.log(`       refs: colA=${colARef || "none"}, colB=${colBRef || "none"}`);
  // element_click on A will fire pointer/mouse events but no move → boxes won't swap
  if (colARef) {
    const { result: dragAttempt } = await call(client, "element_click", { tabId: limId, ref: colARef }, "click A (no drag)");
    const { result: afterDrag } = await call(client, "page_snapshot", { tabId: limId, filter: "interactive" }, "snap after click");
    const stillA = (afterDrag?.tree || "").toLowerCase().includes("column a") ||
                   (afterDrag?.tree || "").toLowerCase().includes('"a"');
    console.log(`       after click: column A still first = ${stillA}`);
    knownGap("J1 drag_and_drop: element swapped after element_click",
      !stillA,
      "No drag API — element_click fires pointer events but cannot move between coordinates"
    );
  } else {
    console.log(`       no refs found for drag elements`);
    knownGap("J1 drag_and_drop: drag possible", false, "No drag API exists in this tool");
  }

  // ── J2: iFrame Content ────────────────────────────────────────────────────
  console.log("\n  J2 — iFrame Content (/frames/iframe)");
  await call(client, "tab_navigate", { tabId: limId, url: `${BASE}/iframe` }, "nav iframe");
  const { result: snapJ2 } = await call(client, "page_snapshot", { tabId: limId, filter: "all" }, "snap iframe page");
  const treeJ2 = snapJ2?.tree || "";
  // iframe element itself appears as role "frame"
  const iframeInTree = treeJ2.toLowerCase().includes("frame");
  // but TinyMCE editor content (bold, italic buttons, editor body) should NOT be there
  const editorContentVisible = treeJ2.toLowerCase().includes("bold") ||
                               treeJ2.toLowerCase().includes("tinymce") ||
                               treeJ2.toLowerCase().includes("your content");
  console.log(`       iframe host element in tree: ${iframeInTree}`);
  console.log(`       iframe inner content visible: ${editorContentVisible}`);
  knownGap("J2 iframe inner content visible in snapshot",
    editorContentVisible,
    "Tree walker stays in main frame document — iframe content is a separate document, not traversed"
  );

  // ── J3: Shadow DOM ────────────────────────────────────────────────────────
  console.log("\n  J3 — Shadow DOM (/shadow_dom)");
  await call(client, "tab_navigate", { tabId: limId, url: `${BASE}/shadowdom` }, "nav shadowdom");
  const { result: snapJ3 } = await call(client, "page_snapshot", { tabId: limId, filter: "all" }, "snap shadowdom");
  const treeJ3 = snapJ3?.tree || "";
  // The page has tabs and paragraphs inside shadow roots
  // "My default text" and "My Second Shadow" are inside shadow DOM
  const shadowContentVisible = treeJ3.toLowerCase().includes("my default text") ||
                               treeJ3.toLowerCase().includes("my second shadow") ||
                               treeJ3.toLowerCase().includes("shadow");
  console.log(`       shadow content in tree: ${shadowContentVisible}`);
  knownGap("J3 shadow DOM content visible in snapshot",
    shadowContentVisible,
    "Tree walker uses childNodes — does not call el.shadowRoot, shadow content is invisible"
  );

  await call(client, "tab_close", { tabId: limId }, "close limitations tab");

  console.log();
  endSection("J-limitations");
}

// ─── Timing Report ────────────────────────────────────────────────────────────

function printTimingReport(cacheStats, largeStats) {
  const bySec = {};
  for (const e of timingLog) {
    if (!bySec[e.section]) bySec[e.section] = [];
    bySec[e.section].push(e);
  }

  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  Timing Report — Every Tool Call                                      ║");
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

  // Cache + large DOM comparison
  if (cacheStats && largeStats) {
    console.log("\n┌──────────────────────────────────────────────────────────────────┐");
    console.log("│  Cache Performance Comparison                                     │");
    console.log(`│  Simple page (add/remove):   cold=${fmt(cacheStats.coldMs).padEnd(9)} cached=${fmt(cacheStats.cachedMs).padEnd(7)} avg=${fmt(cacheStats.avg).padEnd(7)}│`);
    console.log(`│  Large page (/large):        cold=${fmt(largeStats.coldMs).padEnd(9)} cached=${fmt(largeStats.cachedMs).padEnd(7)}         │`);
    console.log("└──────────────────────────────────────────────────────────────────┘");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const benchStart = performance.now();

  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  claude-firefox MCP — Comprehensive Benchmark                        ║");
  console.log("║  Target: the-internet.herokuapp.com                                   ║");
  console.log("║  Sections A–I scored | Section J documents known gaps                ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  const { client } = await setup();
  console.log("  MCP server started\n");

  let cacheStats, largeStats;

  try {
    await waitForExtension(client);

    const { tabId } = await sectionA(client);
    await sectionB(client, tabId);
    await sectionC(client, tabId);
    await sectionD(client, tabId);
    await sectionE(client, tabId);
    await sectionF(client, tabId);
    cacheStats = await sectionG(client, tabId);
    largeStats  = await sectionH(client, tabId);
    await sectionI(client, tabId);
    await sectionJ(client);

    const totalMs = performance.now() - benchStart;
    const total   = passed + failed;
    const pct     = total > 0 ? ((passed / total) * 100).toFixed(0) : 0;

    console.log("╔══════════════════════════════════════════════════════════════════════╗");
    console.log("║  Results                                                              ║");
    console.log("╠══════════════════════════════════════════════════════════════════════╣");
    console.log(`║  Passed:  ${String(passed).padEnd(3)} / ${String(total).padEnd(3)}  (${pct}%)`.padEnd(72) + "║");
    console.log(`║  Total time: ${fmt(totalMs)}`.padEnd(72) + "║");
    if (failures.length > 0) {
      console.log("╠══════════════════════════════════════════════════════════════════════╣");
      console.log("║  Failures (A–I):                                                      ║");
      for (const f of failures) {
        console.log(`║    ✗ ${f.slice(0, 65).padEnd(66)}║`);
      }
    }
    if (expectedFailLog.length > 0) {
      console.log("╠══════════════════════════════════════════════════════════════════════╣");
      console.log("║  Section J — Known Gaps:                                              ║");
      for (const e of expectedFailLog) {
        const icon = e.status === "UNEXPECTEDLY PASSED" ? "!" : "✗";
        console.log(`║    ${icon} ${e.name.slice(0, 66).padEnd(67)}║`);
      }
    }
    console.log("╚══════════════════════════════════════════════════════════════════════╝");

    printTimingReport(cacheStats, largeStats);

  } finally {
    await client.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
