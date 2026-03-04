import type { UnixSocketBridge } from "../unix-socket-bridge.js";
import type { ToolDef } from "./index.js";

export function pageTools(bridge: UnixSocketBridge): ToolDef[] {
  return [
    {
      name: "page_snapshot",
      description:
        "Get the accessibility tree of the current page. Returns interactive elements (links, buttons, inputs) by default, or the full tree with filter=all. Results are served from a live cache updated by the extension — typically instant.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          filter: {
            type: "string",
            enum: ["interactive", "all"],
            description: 'Filter for the accessibility tree. Default: "interactive".',
          },
          depth: {
            type: "number",
            description: "Maximum depth of the tree to traverse (default: 25). Use a smaller depth if output is too large.",
          },
          startRef: {
            type: "string",
            description: "Reference ID of a parent element to read. Will return the specified element and all its children. Use this to focus on a specific part of the page when output is too large.",
          },
        },
        required: ["tabId"],
      },
      handler: async (params) => {
        const tabId = params.tabId as number;
        const startRef = params.startRef as string | undefined;
        const depth = params.depth as number | undefined;
        const requestedFilter = (params.filter as string) ?? "interactive";

        // The bridge cache is always populated with filter="all" trees (from tree_push).
        // Only serve from bridge cache when the caller also requests filter="all".
        // For filter="interactive" (or others), skip the bridge cache so Firefox applies
        // the correct filter — otherwise both filters return identical "all" trees.
        if (!startRef && !depth && requestedFilter === "all") {
          const cached = bridge.getCachedSnapshot(tabId);
          const age = cached ? Date.now() - cached.updatedAt : Infinity;
          // Only serve bridge cache if fresh (<2s). Stale data (e.g. after AJAX)
          // should fall through to the content script for a live rebuild.
          if (cached && age < 2000) {
            return {
              tree: cached.tree,
              fingerprint: cached.fingerprint,
              refCount: cached.refCount,
              url: cached.url,
              title: cached.title,
              cached: true,
              cacheAge: age,
            };
          }
        }

        // Ask Firefox directly. For filter="all" this also warms the bridge cache.
        return bridge.sendRequest("page_snapshot", {
          ...params,
          filter: requestedFilter,
        });
      },
    },
    {
      name: "page_screenshot",
      description: "Take a screenshot of the current page and return it as base64-encoded PNG.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
        },
        required: ["tabId"],
      },
      handler: async (params) => {
        return bridge.sendRequest("page_screenshot", params);
      },
    },
    {
      name: "page_content",
      description:
        "Extract the main text content from the page, stripping navigation, ads, footers, and other boilerplate.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
        },
        required: ["tabId"],
      },
      handler: async (params) => {
        const cached = bridge.getCachedSnapshot(params.tabId as number);
        if (cached?.text) {
          return { title: cached.title, url: cached.url, text: cached.text, cached: true };
        }
        return bridge.sendRequest("page_content", params);
      },
    },
    {
      name: "set_push_focus",
      description:
        "Focus the live push on specific subtrees. After calling this, the extension only walks elements matching the given CSS selectors — reducing payload and speeding up pushes. Call with no selectors (or use clear_push_focus) to revert to full tree.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab." },
          selectors: {
            type: "array",
            items: { type: "string" },
            description: "CSS selectors for subtrees to focus on. Only these areas will be included in pushes.",
          },
        },
        required: ["tabId", "selectors"],
      },
      handler: async (params) => {
        return bridge.sendRequest("set_push_focus", params);
      },
    },
  ];
}
