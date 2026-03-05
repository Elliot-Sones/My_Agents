import type { UnixSocketBridge } from "../unix-socket-bridge.js";
import type { ToolDef, ToolRuntimeInfo } from "./index.js";
import {
  getMemoriesForDomain,
  saveMemory as memSave,
  deleteMemory as memDelete,
} from "../memory.js";

export function utilityTools(bridge: UnixSocketBridge, runtime: ToolRuntimeInfo): ToolDef[] {
  return [
    {
      name: "bridge_status",
      description: "Return Firefox bridge health and runtime paths for debugging.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        return {
          connected: bridge.isConnected(),
          socketPath: bridge.getSocketPath(),
          homeDir: runtime.homeDir,
          captureUrl: `http://${runtime.captureHost}:${runtime.capturePort}/capture`,
          queueDepth: bridge.getQueueDepth(),
          requestTimeoutMs: bridge.getRequestTimeoutMs(),
        };
      },
    },
    {
      name: "page_evaluate",
      description: "Execute JavaScript in the page context and return the result.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          expression: { type: "string", description: "JavaScript expression to evaluate." },
        },
        required: ["tabId", "expression"],
      },
      handler: async (params) => {
        return bridge.sendRequest("page_evaluate", params);
      },
    },
    {
      name: "console_read",
      description: "Read console messages from the page. Optionally filter by a regex pattern.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          pattern: {
            type: "string",
            description: "Optional regex pattern to filter console messages.",
          },
        },
        required: ["tabId"],
      },
      handler: async (params) => {
        return bridge.sendRequest("console_read", params);
      },
    },
    {
      name: "network_requests",
      description: "Read captured network requests from the page.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
        },
        required: ["tabId"],
      },
      handler: async (params) => {
        return bridge.sendRequest("network_requests", params);
      },
    },
    {
      name: "wait_for",
      description:
        "Wait for a condition on a tab. Use 'previousFingerprint' (from a prior page_snapshot) to wait until the page changes — ideal after tab_navigate or element_click. Use 'stable' to wait until the page stops changing (ideal after clicking Submit on a streaming response — resolves when DOM is quiet for N ms). Use 'url' to wait until the cached URL matches a pattern. Use 'selector' (CSS) to wait for a DOM element to appear — requires a Firefox round-trip. Use 'timeout' alone for a fixed delay.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          previousFingerprint: {
            type: "string",
            description: "Wait until the page fingerprint changes from this value. Pass the fingerprint from the last page_snapshot. Resolves instantly from local cache — no Firefox round-trip.",
          },
          stable: {
            type: "number",
            description: "Wait until the page fingerprint has not changed for this many ms (e.g. 2000). Perfect for detecting when a streaming response finishes. Resolves from local cache — no Firefox round-trip.",
          },
          url: {
            type: "string",
            description: "Wait until the cached page URL contains this pattern. Resolves from local cache — no Firefox round-trip.",
          },
          selector: {
            type: "string",
            description: "CSS selector to wait for in the DOM. Requires a Firefox round-trip.",
          },
          timeout: {
            type: "number",
            description: "Max wait time in ms (default 10000). Used as a fixed delay when no other condition is given.",
          },
        },
        required: ["tabId"],
      },
      handler: async (params) => {
        const tabId = params.tabId as number;
        const timeout = (params.timeout as number) || 10000;
        const startTime = Date.now();
        const deadline = startTime + timeout;

        // CSS selector: needs Firefox DOM access
        if (params.selector) {
          return bridge.sendRequest("wait_for", params);
        }

        // Stability: wait until fingerprint hasn't changed for N ms
        if (params.stable) {
          const stableMs = params.stable as number;
          let lastFingerprint: string | undefined;
          let lastChangeTime = Date.now();
          while (Date.now() < deadline) {
            const cached = bridge.getCachedSnapshot(tabId);
            const fp = cached?.fingerprint;
            if (fp !== lastFingerprint) {
              lastFingerprint = fp;
              lastChangeTime = Date.now();
            } else if (Date.now() - lastChangeTime >= stableMs) {
              return {
                stable: true,
                fingerprint: lastFingerprint,
                url: cached?.url,
                title: cached?.title,
                text: cached?.text || undefined,
                elapsed: Date.now() - startTime,
              };
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          return { stable: false, timedOut: true };
        }

        // Fingerprint change: poll local push cache
        if (params.previousFingerprint) {
          const prev = params.previousFingerprint as string;
          while (Date.now() < deadline) {
            const cached = bridge.getCachedSnapshot(tabId);
            if (cached && cached.fingerprint !== prev) {
              return { changed: true, fingerprint: cached.fingerprint, url: cached.url, elapsed: Date.now() - startTime };
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          return { changed: false, timedOut: true };
        }

        // URL pattern: poll local push cache
        if (params.url) {
          const pattern = params.url as string;
          while (Date.now() < deadline) {
            const cached = bridge.getCachedSnapshot(tabId);
            if (cached?.url?.includes(pattern)) {
              return { matched: true, url: cached.url, elapsed: Date.now() - startTime };
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          return { matched: false, pattern, timedOut: true };
        }

        // Pure timeout: local sleep
        await new Promise((r) => setTimeout(r, timeout));
        return { waited: timeout };
      },
    },
    {
      name: "save_memory",
      description:
        'Save a memory for a domain. Key must be in format "domain::category::identifier" where category is selector, pattern, or workflow.',
      inputSchema: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: 'Memory key in format "domain::category::identifier".',
          },
          value: { type: "string", description: "Value to remember." },
        },
        required: ["key", "value"],
      },
      handler: async (params) => {
        const key = params.key as string;
        const value = params.value as string;
        const parts = key.split("::");
        if (parts.length < 3) {
          return { error: "Key must be in format domain::category::identifier" };
        }
        memSave(key, value);
        return { success: true, key };
      },
    },
    {
      name: "list_memories",
      description: "List all saved memories for a domain.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain to list memories for." },
        },
        required: ["domain"],
      },
      handler: async (params) => {
        const domain = params.domain as string;
        return getMemoriesForDomain(domain);
      },
    },
    {
      name: "delete_memory",
      description: "Delete a memory by its key.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Memory key to delete." },
        },
        required: ["key"],
      },
      handler: async (params) => {
        const key = params.key as string;
        const deleted = memDelete(key);
        return { success: deleted, key };
      },
    },
  ];
}
