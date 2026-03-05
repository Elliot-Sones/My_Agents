import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { UnixSocketBridge } from "./unix-socket-bridge.js";
import { registerTools } from "./tools/index.js";
import { loadMemories, decayMemories, setMemoryPath } from "./memory.js";
import { startCaptureServer } from "./capture-server.js";
import { getRuntimeConfig } from "./runtime-config.js";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";

function killStaleInstance(pidFile: string): void {
  if (!existsSync(pidFile)) return;

  try {
    const oldPid = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
    if (isNaN(oldPid)) {
      unlinkSync(pidFile);
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

    unlinkSync(pidFile);
  } catch {
    // PID file read/delete failed, continue anyway
  }
}

function writePidFile(pidDir: string, pidFile: string): void {
  mkdirSync(pidDir, { recursive: true });
  writeFileSync(pidFile, String(process.pid), "utf8");
}

function removePidFile(pidFile: string): void {
  try {
    unlinkSync(pidFile);
  } catch {
    // Already gone
  }
}

async function main() {
  const config = getRuntimeConfig();
  console.error("[main] Starting claude-firefox MCP server...");

  // Kill any stale instance before binding ports
  killStaleInstance(config.pidFile);
  writePidFile(config.homeDir, config.pidFile);

  // Load memories from disk
  setMemoryPath(config.memoryFile);
  loadMemories();
  decayMemories();

  // Create MCP server
  const server = new Server(
    { name: "claude-firefox", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // Start capture HTTP server
  startCaptureServer({
    homeDir: config.homeDir,
    captureFile: config.captureFile,
    captureHost: config.captureHost,
    capturePort: config.capturePort,
  });

  // Start Unix socket bridge
  const bridge = new UnixSocketBridge({
    socketPath: config.socketPath,
    requestTimeoutMs: config.requestTimeoutMs,
  });
  bridge.onConnected = () => {
    console.error("[main] Firefox extension connected");
  };
  bridge.onDisconnected = () => {
    console.error("[main] Firefox extension disconnected");
  };
  bridge.start();

  // Register all tools
  registerTools(server, bridge, {
    homeDir: config.homeDir,
    captureHost: config.captureHost,
    capturePort: config.capturePort,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  // Connect MCP server to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[main] MCP server connected to stdio transport");

  // Graceful shutdown
  const shutdown = () => {
    console.error("[main] Shutting down...");
    removePidFile(config.pidFile);
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
