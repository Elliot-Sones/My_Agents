// End-to-end test: Start WebSocket bridge, load extension in Firefox, test real interaction
import { WebSocketBridge } from "../build/websocket-bridge.js";
import { loadMemories } from "../build/memory.js";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { exec } from "child_process";

const SECRET_PATH = join(homedir(), ".claude-firefox", "secret.txt");

loadMemories();

let passed = 0;
let failed = 0;
let bridge;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForCondition(fn, timeoutMs = 15000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await sleep(intervalMs);
  }
  return false;
}

async function runTests() {
  console.log("=== End-to-End Browser Tests ===\n");

  const secret = readFileSync(SECRET_PATH, "utf-8").trim();
  console.log(`Secret: ${secret.slice(0, 8)}...`);

  // Start the WebSocket bridge
  bridge = new WebSocketBridge();
  let extensionConnected = false;
  bridge.onConnected = () => {
    extensionConnected = true;
    console.log("  [Event] Extension connected!");
  };
  bridge.onDisconnected = () => {
    extensionConnected = false;
    console.log("  [Event] Extension disconnected");
  };
  bridge.start();
  console.log("WebSocket bridge started on port 7865\n");

  // Open Firefox with about:debugging to load the extension
  console.log("Opening Firefox...");
  console.log("INSTRUCTIONS:");
  console.log("  1. In Firefox, go to about:debugging#/runtime/this-firefox");
  console.log("  2. Click 'Load Temporary Add-on...'");
  console.log(`  3. Select: ${join(process.cwd(), "extension/manifest.json")}`);
  console.log(`  4. Click the extension icon → paste secret: ${secret}`);
  console.log("  5. Click 'Save & Reconnect'");
  console.log("  Waiting for connection...\n");

  // Don't open Firefox - user already has it running with the extension loaded

  // Wait for extension to connect
  const connected = await waitForCondition(() => extensionConnected, 120000, 1000);
  assert(connected, "Extension connected to WebSocket bridge");

  if (!connected) {
    console.log("\nExtension didn't connect. Skipping remaining tests.");
    bridge.stop();
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(1);
  }

  // ─── Test: tab_create ───
  console.log("\nTest: tab_create");
  const createResult = await bridge.sendRequest("tab_create", {
    url: "https://example.com",
    active: true,
  });
  assert(createResult.tabId > 0, `Tab created with ID ${createResult.tabId}`);
  const tabId = createResult.tabId;
  await sleep(2000); // Wait for page to load

  // ─── Test: tab_list ───
  console.log("\nTest: tab_list");
  const listResult = await bridge.sendRequest("tab_list", {});
  const claudeTabs = listResult.filter(t => t.claudeManaged);
  assert(claudeTabs.length >= 1, `${claudeTabs.length} Claude-managed tab(s) found`);
  const ourTab = claudeTabs.find(t => t.tabId === tabId);
  assert(ourTab !== undefined, "Our created tab is in the list");
  assert(ourTab?.url?.includes("example.com"), `Tab URL is example.com (got: ${ourTab?.url})`);

  // ─── Test: page_snapshot (interactive) ───
  console.log("\nTest: page_snapshot (interactive filter)");
  const snapResult = await bridge.sendRequest("snapshot", {
    tabId,
    filter: "interactive",
  });
  assert(snapResult.tree !== undefined, "Snapshot tree returned");
  assert(snapResult.fingerprint !== undefined, "Fingerprint returned");
  const interactiveLines = snapResult.tree.split("\n").filter(l => l.trim()).length;
  console.log(`  Interactive elements: ${interactiveLines}`);
  assert(interactiveLines > 0, "Found interactive elements");

  // ─── Test: page_snapshot (all) ───
  console.log("\nTest: page_snapshot (all filter)");
  const snapAllResult = await bridge.sendRequest("snapshot", {
    tabId,
    filter: "all",
  });
  const allLines = snapAllResult.tree.split("\n").filter(l => l.trim()).length;
  console.log(`  All elements: ${allLines}`);
  assert(allLines >= interactiveLines, "All filter returns >= interactive elements");

  // ─── Test: page_content ───
  console.log("\nTest: page_content");
  const contentResult = await bridge.sendRequest("content", { tabId });
  assert(contentResult.text !== undefined, "Text content extracted");
  assert(contentResult.text.includes("Example Domain"), `Content includes "Example Domain"`);

  // ─── Test: navigate to a more complex page ───
  console.log("\nTest: tab_navigate to Wikipedia");
  const navResult = await bridge.sendRequest("tab_navigate", {
    tabId,
    url: "https://en.wikipedia.org/wiki/Firefox",
  });
  assert(navResult.url.includes("wikipedia"), `Navigated to Wikipedia (${navResult.url})`);
  await sleep(1000);

  // ─── Test: snapshot of Wikipedia ───
  console.log("\nTest: snapshot of Wikipedia");
  const wikiSnap = await bridge.sendRequest("snapshot", { tabId, filter: "interactive" });
  const wikiLines = wikiSnap.tree.split("\n").filter(l => l.trim()).length;
  console.log(`  Wikipedia interactive elements: ${wikiLines}`);
  assert(wikiLines > 10, `Found ${wikiLines} interactive elements on Wikipedia`);
  console.log(`  Snapshot size: ${wikiSnap.tree.length} chars (~${Math.round(wikiSnap.tree.length / 4)} tokens)`);

  // ─── Test: element_click (find a link and click it) ───
  console.log("\nTest: element_click");
  // Find a link in the snapshot
  const linkMatch = wikiSnap.tree.match(/\[(ref_\d+)\] link "([^"]+)"/);
  if (linkMatch) {
    const [, refId, linkText] = linkMatch;
    console.log(`  Clicking: ${refId} "${linkText}"`);
    const clickResult = await bridge.sendRequest("click", { tabId, ref: refId });
    assert(clickResult.success === true, "Click succeeded");
    if (clickResult.verification) {
      console.log(`  URL changed: ${clickResult.verification.urlChanged}`);
      console.log(`  DOM changed: ${clickResult.verification.domChanged}`);
    }
  } else {
    console.log("  No link found in snapshot, skipping click test");
    assert(false, "Expected to find links on Wikipedia");
  }
  await sleep(1000);

  // ─── Test: console_read ───
  console.log("\nTest: console_read");
  const consoleResult = await bridge.sendRequest("console_read", { tabId });
  assert(consoleResult.messages !== undefined, "Console messages array returned");
  console.log(`  Captured ${consoleResult.messages.length} console messages`);

  // ─── Test: page_evaluate ───
  console.log("\nTest: page_evaluate");
  try {
    const evalResult = await bridge.sendRequest("evaluate", {
      tabId,
      expression: "document.title",
    });
    assert(evalResult.result !== undefined && evalResult.result !== "undefined",
      `Eval returned: "${evalResult.result}"`);
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    assert(false, "page_evaluate threw: " + e.message);
  }

  // ─── Test: screenshot ───
  console.log("\nTest: screenshot");
  try {
    const ssResult = await bridge.sendRequest("screenshot", { tabId });
    assert(ssResult.screenshot !== undefined, "Screenshot data returned");
    const ssSize = ssResult.screenshot?.length || 0;
    console.log(`  Screenshot data size: ${Math.round(ssSize / 1024)}KB`);
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    assert(false, "screenshot threw: " + e.message);
  }

  // ─── Test: network_requests ───
  console.log("\nTest: network_requests");
  try {
    const netResult = await bridge.sendRequest("network_requests", { tabId });
    assert(netResult.requests !== undefined, "Network requests returned");
    console.log(`  Captured ${netResult.requests.length} network requests`);
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    assert(false, "network_requests threw: " + e.message);
  }

  // ─── Test: tab_close ───
  console.log("\nTest: tab_close");
  const closeResult = await bridge.sendRequest("tab_close", { tabId });
  assert(closeResult.closed === true, "Tab closed");

  // Verify tab is gone
  await sleep(500);
  const listAfter = await bridge.sendRequest("tab_list", {});
  const claudeTabsAfter = listAfter.filter(t => t.claudeManaged);
  assert(!claudeTabsAfter.find(t => t.tabId === tabId), "Closed tab no longer in list");

  // Cleanup
  bridge.stop();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("Test error:", err);
  if (bridge) bridge.stop();
  process.exit(1);
});
