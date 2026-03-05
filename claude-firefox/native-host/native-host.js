#!/usr/bin/env node
// Native host bridge: relays between Firefox native messaging and Unix socket

import { createConnection } from "net";
import { join } from "path";
import { homedir } from "os";

const bridgeHome = process.env.CLAUDE_FIREFOX_HOME || join(homedir(), ".claude-firefox");
const SOCKET_PATH = join(bridgeHome, "bridge.sock");
const RECONNECT_DELAY = 1000;

let socket = null;
let connected = false;

// ─── Native Messaging (stdin/stdout) ─────────────────────────────────────────

function readNativeMessage(buf, offset) {
  if (buf.length - offset < 4) return null;
  const len = buf.readUInt32LE(offset);
  if (buf.length - offset - 4 < len) return null;
  const json = buf.subarray(offset + 4, offset + 4 + len).toString("utf8");
  return { msg: JSON.parse(json), consumed: 4 + len };
}

function writeNativeMessage(obj) {
  const json = JSON.stringify(obj);
  const buf = Buffer.allocUnsafe(4 + json.length);
  buf.writeUInt32LE(json.length, 0);
  buf.write(json, 4, "utf8");
  process.stdout.write(buf);
}

// ─── Unix socket connection ───────────────────────────────────────────────────

function connectToMCP() {
  socket = createConnection(SOCKET_PATH, () => {
    connected = true;
    process.stderr.write("[native-host] Connected to MCP server\n");
  });

  let lineBuffer = "";
  socket.setEncoding("utf8");

  socket.on("data", (data) => {
    lineBuffer += data;
    let newline;
    while ((newline = lineBuffer.indexOf("\n")) !== -1) {
      const line = lineBuffer.slice(0, newline).trim();
      lineBuffer = lineBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        writeNativeMessage(msg);
      } catch (e) {
        process.stderr.write(`[native-host] Bad JSON from socket: ${e.message}\n`);
      }
    }
  });

  socket.on("close", () => {
    connected = false;
    process.stderr.write("[native-host] Disconnected from MCP server, reconnecting...\n");
    setTimeout(connectToMCP, RECONNECT_DELAY);
  });

  socket.on("error", (err) => {
    process.stderr.write(`[native-host] Socket error: ${err.message}\n`);
    // close event will fire and trigger reconnect
  });
}

// ─── stdin reader ─────────────────────────────────────────────────────────────

let stdinBuf = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  stdinBuf = Buffer.concat([stdinBuf, chunk]);
  let offset = 0;
  while (true) {
    const result = readNativeMessage(stdinBuf, offset);
    if (!result) break;
    const { msg, consumed } = result;
    offset += consumed;
    if (socket && connected) {
      socket.write(JSON.stringify(msg) + "\n");
    }
  }
  if (offset > 0) {
    stdinBuf = stdinBuf.subarray(offset);
  }
});

process.stdin.on("end", () => {
  process.stderr.write("[native-host] stdin EOF (keeping socket connection alive)\n");
});

// ─── Start ────────────────────────────────────────────────────────────────────

process.stderr.write("[native-host] Starting...\n");
process.stderr.write(`[native-host] Socket path: ${SOCKET_PATH}\n`);

process.on("SIGTERM", () => {
  process.stderr.write("[native-host] SIGTERM received, shutting down\n");
  if (socket) socket.destroy();
  process.exit(0);
});

connectToMCP();
