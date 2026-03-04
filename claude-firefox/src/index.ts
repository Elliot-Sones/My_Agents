import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { UnixSocketBridge } from "./unix-socket-bridge.js";
import { registerTools } from "./tools/index.js";
import { loadMemories, decayMemories } from "./memory.js";
import { startCaptureServer } from "./capture-server.js";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PID_DIR = join(homedir(), ".claude-firefox");
const PID_FILE = join(PID_DIR, "server.pid");

function killStaleInstance(): void {
  if (!existsSync(PID_FILE)) return;

  try {
    const oldPid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
    if (isNaN(oldPid)) {
      unlinkSync(PID_FILE);
      return;
    }

    // Check if the process is still alive
    try {
      process.kill(oldPid, 0); // signal 0 = just check existence
      console.error(`[main] Killing stale instance (PID ${oldPid})...`);
      process.kill(oldPid, "SIGTERM");

      // Wait up to 2s for it to die
      const start = Date.now();
      while (Date.now() - start < 2000) {
        try {
          process.kill(oldPid, 0);
          // Still alive, busy-wait briefly
          const waitUntil = Date.now() + 100;
          while (Date.now() < waitUntil) { /* spin */ }
        } catch {
          break; // Process is gone
        }
      }

      // Force kill if still alive
      try {
        process.kill(oldPid, 0);
        console.error(`[main] Force killing stale instance (PID ${oldPid})...`);
        process.kill(oldPid, "SIGKILL");
      } catch {
        // Already dead, good
      }
    } catch {
      // Process doesn't exist, clean up stale PID file
    }

    unlinkSync(PID_FILE);
  } catch {
    // PID file read/delete failed, continue anyway
  }
}

function writePidFile(): void {
  mkdirSync(PID_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid), "utf8");
}

function removePidFile(): void {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // Already gone
  }
}

async function main() {
  console.error("[main] Starting claude-firefox MCP server...");

  // Kill any stale instance before binding ports
  killStaleInstance();
  writePidFile();

  // Load memories from disk
  loadMemories();
  decayMemories();

  // Create MCP server
  const server = new Server(
    { name: "claude-firefox", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // Start capture HTTP server (port 7866)
  startCaptureServer();

  // Start Unix socket bridge
  const bridge = new UnixSocketBridge();
  bridge.onConnected = () => {
    console.error("[main] Firefox extension connected");
  };
  bridge.onDisconnected = () => {
    console.error("[main] Firefox extension disconnected");
  };
  bridge.start();

  // Register all tools
  registerTools(server, bridge, null);

  // Connect MCP server to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[main] MCP server connected to stdio transport");

  // Graceful shutdown
  const shutdown = () => {
    console.error("[main] Shutting down...");
    removePidFile();
    bridge.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
