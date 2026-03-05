import { homedir } from "os";
import { join } from "path";

const DEFAULT_HOME_DIR = join(homedir(), ".claude-firefox");
const DEFAULT_CAPTURE_HOST = "127.0.0.1";
const DEFAULT_CAPTURE_PORT = 7866;
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
const MIN_REQUEST_TIMEOUT_MS = 5000;

export interface RuntimeConfig {
  homeDir: string;
  socketPath: string;
  pidFile: string;
  memoryFile: string;
  captureFile: string;
  captureHost: string;
  capturePort: number;
  requestTimeoutMs: number;
}

function parsePort(raw: string | undefined): number {
  if (!raw) return DEFAULT_CAPTURE_PORT;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    console.error(
      `[config] Invalid CLAUDE_FIREFOX_CAPTURE_PORT="${raw}", using ${DEFAULT_CAPTURE_PORT}`
    );
    return DEFAULT_CAPTURE_PORT;
  }
  return value;
}

function parseTimeout(raw: string | undefined): number {
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < MIN_REQUEST_TIMEOUT_MS) {
    console.error(
      `[config] Invalid CLAUDE_FIREFOX_REQUEST_TIMEOUT_MS="${raw}", using ${DEFAULT_REQUEST_TIMEOUT_MS}`
    );
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }
  return value;
}

export function getRuntimeConfig(): RuntimeConfig {
  const homeDir = process.env.CLAUDE_FIREFOX_HOME || DEFAULT_HOME_DIR;
  const captureHost = process.env.CLAUDE_FIREFOX_CAPTURE_HOST || DEFAULT_CAPTURE_HOST;

  return {
    homeDir,
    socketPath: join(homeDir, "bridge.sock"),
    pidFile: join(homeDir, "server.pid"),
    memoryFile: join(homeDir, "memory.json"),
    captureFile: join(homeDir, "page-context.txt"),
    captureHost,
    capturePort: parsePort(process.env.CLAUDE_FIREFOX_CAPTURE_PORT),
    requestTimeoutMs: parseTimeout(process.env.CLAUDE_FIREFOX_REQUEST_TIMEOUT_MS),
  };
}
