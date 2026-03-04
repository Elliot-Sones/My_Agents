import { createServer, Socket, Server } from "net";
import { randomUUID } from "crypto";
import { mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ToolRequest } from "./types.js";

const SOCKET_DIR = join(homedir(), ".claude-firefox");
export const SOCKET_PATH = join(SOCKET_DIR, "bridge.sock");
const REQUEST_TIMEOUT = 60000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface TabTreeState {
  tree: string;
  fingerprint: string;
  refCount: number;
  url: string;
  title: string;
  text: string;
  updatedAt: number;
}

export class UnixSocketBridge {
  private server: Server | null = null;
  private client: Socket | null = null;
  private pending = new Map<string, PendingRequest>();
  private queue: ToolRequest[] = [];
  private buffer = "";

  // Live tree cache — populated by extension pushes, read by page_snapshot
  private tabState = new Map<number, TabTreeState>();

  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;

  start(): void {
    mkdirSync(SOCKET_DIR, { recursive: true });
    try { unlinkSync(SOCKET_PATH); } catch { /* no stale socket */ }

    this.server = createServer((socket) => {
      console.error("[bridge] Native host connected");
      if (this.client) {
        console.error("[bridge] Replacing existing connection");
        this.client.destroy();
      }
      this.client = socket;
      this.buffer = "";
      socket.setEncoding("utf8");

      socket.on("data", (data: string) => {
        this.buffer += data;
        this.processBuffer();
      });

      socket.on("close", () => {
        console.error("[bridge] Native host disconnected");
        if (this.client === socket) {
          this.client = null;
          this.buffer = "";
          this.onDisconnected?.();
        }
      });

      socket.on("error", (err: Error) => {
        console.error("[bridge] Socket error:", err.message);
      });

      this.onConnected?.();
      this.replayQueue();
    });

    this.server.on("error", (err: Error) => {
      console.error("[bridge] Server error:", err.message);
    });

    this.server.listen(SOCKET_PATH, () => {
      console.error(`[bridge] Unix socket listening at ${SOCKET_PATH}`);
    });
  }

  private processBuffer(): void {
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let msg: { id: string; type: string; result?: unknown; error?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        console.error("[bridge] Invalid JSON received");
        continue;
      }
      this.handleMessage(msg);
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    // Tree push from extension — update live cache
    if (msg.type === "tree_push" && typeof msg.tabId === "number") {
      this.tabState.set(msg.tabId, {
        tree: msg.tree as string,
        fingerprint: msg.fingerprint as string,
        refCount: msg.refCount as number,
        url: msg.url as string,
        title: msg.title as string,
        text: (msg.text as string) || "",
        updatedAt: Date.now(),
      });
      return;
    }

    // Tab closed — clear cached tree
    if (msg.type === "tab_state_clear" && typeof msg.tabId === "number") {
      this.tabState.delete(msg.tabId);
      return;
    }

    // Normal request/response
    if (msg.type === "response" && typeof msg.id === "string") {
      const pending = this.pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error as string));
        } else {
          pending.resolve(msg.result);
        }
      }
    }
  }

  getCachedSnapshot(tabId: number): TabTreeState | undefined {
    return this.tabState.get(tabId);
  }

  async sendRequest(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = randomUUID();
    const request: ToolRequest = { id, type: "request", action, params };
    const startTime = Date.now();

    if (!this.isConnected()) {
      console.error(`[bridge] Extension not connected, queuing request: ${action}`);
      this.queue.push(request);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          const idx = this.queue.indexOf(request);
          if (idx !== -1) this.queue.splice(idx, 1);
          reject(new Error("Request timed out (extension not connected)"));
        }, REQUEST_TIMEOUT);
        this.pending.set(id, { resolve, reject, timer });
      });
    }

    const result = await this.sendDirect(request);
    const elapsed = Date.now() - startTime;
    console.error(`[bridge] ${action} (${id.slice(0, 8)}) → ${elapsed}ms`);
    return result;
  }

  private sendDirect(request: ToolRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Request timed out: ${request.action}`));
      }, REQUEST_TIMEOUT);
      this.pending.set(request.id, { resolve, reject, timer });
      this.client!.write(JSON.stringify(request) + "\n");
    });
  }

  private replayQueue(): void {
    if (this.queue.length === 0) return;
    console.error(`[bridge] Replaying ${this.queue.length} queued requests`);
    const queued = [...this.queue];
    this.queue = [];
    for (const request of queued) {
      this.client!.write(JSON.stringify(request) + "\n");
    }
  }

  isConnected(): boolean {
    return this.client !== null && !this.client.destroyed;
  }

  stop(): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Bridge shutting down"));
    }
    this.pending.clear();

    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    try { unlinkSync(SOCKET_PATH); } catch { /* already gone */ }
  }
}
