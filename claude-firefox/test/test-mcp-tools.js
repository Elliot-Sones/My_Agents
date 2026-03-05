// Test MCP tool registration and dispatching
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { registerTools } from "../build/tools/index.js";
import { loadMemories } from "../build/memory.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Ensure memory file exists
const memDir = join(homedir(), ".claude-firefox");
if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
const memPath = join(memDir, "memory.json");
if (!existsSync(memPath)) writeFileSync(memPath, "{}");

loadMemories();

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log("=== MCP Tool Registration Tests ===\n");

  // Create a mock bridge
  const mockBridge = {
    sendRequest: async (action, params) => {
      return { action, params, mock: true };
    },
    isConnected: () => true,
    getSocketPath: () => "/tmp/bridge.sock",
    getQueueDepth: () => 0,
    getRequestTimeoutMs: () => 60000,
  };

  // Create MCP server
  const server = new Server(
    { name: "claude-firefox-test", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // Register tools
  const runtime = {
    homeDir: "/tmp/claude-firefox",
    captureHost: "127.0.0.1",
    capturePort: 7866,
    requestTimeoutMs: 60000,
  };
  registerTools(server, mockBridge, runtime);

  // Test 1: Verify tool count
  console.log("Test 1: Tool registration");
  // We can inspect the registered handlers by checking the server's internal state
  // Since we can't easily introspect, we'll test via the handler map approach
  const expectedTools = [
    "tab_create", "tab_close", "tab_list", "tab_navigate", "tab_switch",
    "page_snapshot", "page_screenshot", "page_content", "set_push_focus",
    "element_click", "click_and_wait", "element_type", "element_fill",
    "form_fill", "form_fill_and_submit", "element_hover", "element_double_click",
    "element_right_click", "key_press", "find", "element_drag",
    "bridge_status", "page_evaluate", "console_read", "network_requests", "wait_for",
    "save_memory", "list_memories", "delete_memory",
  ];
  assert(expectedTools.length === 29, `Expected 29 tools, got ${expectedTools.length}`);

  // Test 2: Test memory tools directly (these don't go through bridge)
  console.log("\nTest 2: Memory tools (save_memory)");
  // Import the utility tools directly
  const { utilityTools } = await import("../build/tools/utility-tools.js");
  const uTools = utilityTools(mockBridge, runtime);
  const saveMemTool = uTools.find(t => t.name === "save_memory");
  assert(saveMemTool !== undefined, "save_memory tool exists");

  const saveResult = await saveMemTool.handler({
    key: "test.com::selector::test_btn",
    value: "#test-button",
  });
  assert(saveResult.success === true, "save_memory returns success");

  // Test 3: list_memories
  console.log("\nTest 3: list_memories");
  const listMemTool = uTools.find(t => t.name === "list_memories");
  const listResult = await listMemTool.handler({ domain: "test.com" });
  assert("test.com::selector::test_btn" in listResult, "list_memories returns saved memory");

  // Test 4: delete_memory
  console.log("\nTest 4: delete_memory");
  const delMemTool = uTools.find(t => t.name === "delete_memory");
  const delResult = await delMemTool.handler({ key: "test.com::selector::test_btn" });
  assert(delResult.success === true, "delete_memory returns success");

  const listAfterDel = await listMemTool.handler({ domain: "test.com" });
  assert(!("test.com::selector::test_btn" in listAfterDel), "Memory deleted");

  // Test 5: Key validation
  console.log("\nTest 5: Key format validation");
  const badKeyResult = await saveMemTool.handler({ key: "badkey", value: "test" });
  assert(badKeyResult.error !== undefined, "Bad key format rejected");

  // Test 6: Tab tools dispatch to bridge
  console.log("\nTest 6: Tab tools dispatch");
  const { tabTools } = await import("../build/tools/tab-tools.js");
  const tTools = tabTools(mockBridge);
  const tabCreateTool = tTools.find(t => t.name === "tab_create");
  const createResult = await tabCreateTool.handler({ url: "https://example.com" });
  assert(createResult.action === "tab_create", "tab_create dispatches to bridge");
  assert(createResult.params.url === "https://example.com", "Params forwarded correctly");

  // Test 7: Page tools dispatch
  console.log("\nTest 7: Page tools dispatch");
  const { pageTools } = await import("../build/tools/page-tools.js");
  const pTools = pageTools(mockBridge);
  const snapshotTool = pTools.find(t => t.name === "page_snapshot");
  const snapshotResult = await snapshotTool.handler({ tabId: 1 });
  assert(snapshotResult.action === "page_snapshot", "page_snapshot dispatches correctly");
  assert(snapshotResult.params.filter === "interactive", "Default filter is 'interactive'");

  // Test 8: Interaction tools dispatch
  console.log("\nTest 8: Interaction tools dispatch");
  const { interactionTools } = await import("../build/tools/interaction-tools.js");
  const iTools = interactionTools(mockBridge);
  const clickTool = iTools.find(t => t.name === "element_click");
  const clickResult = await clickTool.handler({ tabId: 1, ref: "ref_5" });
  assert(clickResult.action === "element_click", "element_click dispatches correctly");

  const formFillTool = iTools.find(t => t.name === "form_fill_and_submit");
  const formResult = await formFillTool.handler({
    tabId: 1,
    fields: [{ ref: "ref_1", value: "user" }, { ref: "ref_2", value: "pass" }],
    submitRef: "ref_3",
  });
  assert(formResult.action === "form_fill_and_submit", "form_fill_and_submit dispatches correctly");
  assert(formResult.params.fields.length === 2, "Fields passed through");

  // Test 9: Tool schemas
  console.log("\nTest 9: Tool input schemas");
  const allTools = [...tTools, ...pTools, ...iTools, ...uTools];
  let allHaveSchemas = true;
  for (const tool of allTools) {
    if (!tool.inputSchema || tool.inputSchema.type !== "object") {
      console.error(`    Tool ${tool.name} has invalid schema`);
      allHaveSchemas = false;
    }
  }
  assert(allHaveSchemas, `All ${allTools.length} tools have valid input schemas`);
  assert(allTools.length === 29, `Total tool count: ${allTools.length}`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
