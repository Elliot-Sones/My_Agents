import type { UnixSocketBridge } from "../unix-socket-bridge.js";
import type { ToolDef } from "./index.js";

export function tabTools(bridge: UnixSocketBridge): ToolDef[] {
  return [
    {
      name: "tab_create",
      description: "Create a new browser tab, optionally navigating to a URL. The tab is marked as a Claude-controlled tab.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to open. If omitted, opens a blank tab." },
        },
      },
      handler: async (params) => {
        return bridge.sendRequest("tab_create", params);
      },
    },
    {
      name: "tab_close",
      description: "Close a browser tab by its ID.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab to close." },
        },
        required: ["tabId"],
      },
      handler: async (params) => {
        return bridge.sendRequest("tab_close", params);
      },
    },
    {
      name: "tab_list",
      description: "List all open browser tabs with their IDs, URLs, titles, and whether they are Claude-controlled.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async (params) => {
        return bridge.sendRequest("tab_list", params);
      },
    },
    {
      name: "tab_navigate",
      description: "Navigate an existing tab to a new URL.",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab to navigate." },
          url: { type: "string", description: "URL to navigate to." },
        },
        required: ["tabId", "url"],
      },
      handler: async (params) => {
        return bridge.sendRequest("tab_navigate", params);
      },
    },
    {
      name: "tab_switch",
      description: "Bring a tab to focus (make it the active tab).",
      inputSchema: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "ID of the tab to focus." },
        },
        required: ["tabId"],
      },
      handler: async (params) => {
        return bridge.sendRequest("tab_switch", params);
      },
    },
  ];
}
