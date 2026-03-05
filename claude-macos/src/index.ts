import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PID_DIR = join(homedir(), ".claude-macos");
const PID_FILE = join(PID_DIR, "server.pid");

function killStaleInstance(): void {
  if (!existsSync(PID_FILE)) return;

  try {
    const oldPid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
    if (isNaN(oldPid)) {
      unlinkSync(PID_FILE);
      return;
    }

    try {
      process.kill(oldPid, 0);
      console.error(`[main] Killing stale instance (PID ${oldPid})...`);
      process.kill(oldPid, "SIGTERM");

      const start = Date.now();
      while (Date.now() - start < 2000) {
        try {
          process.kill(oldPid, 0);
          const waitUntil = Date.now() + 100;
          while (Date.now() < waitUntil) { /* spin */ }
        } catch {
          break;
        }
      }

      try {
        process.kill(oldPid, 0);
        console.error(`[main] Force killing stale instance (PID ${oldPid})...`);
        process.kill(oldPid, "SIGKILL");
      } catch {
        // Already dead
      }
    } catch {
      // Process doesn't exist
    }

    unlinkSync(PID_FILE);
  } catch {
    // PID file read/delete failed
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
  console.error("[main] Starting claude-macos MCP server...");

  killStaleInstance();
  writePidFile();

  const server = new Server(
    { name: "claude-macos", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[main] MCP server connected to stdio transport");

  const shutdown = () => {
    console.error("[main] Shutting down...");
    removePidFile();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
