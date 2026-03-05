import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { UnixSocketBridge } from "../unix-socket-bridge.js";
import { tabTools } from "./tab-tools.js";
import { pageTools } from "./page-tools.js";
import { interactionTools } from "./interaction-tools.js";
import { utilityTools } from "./utility-tools.js";
import { getMemoriesForDomain } from "../memory.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolRuntimeInfo {
  homeDir: string;
  captureHost: string;
  capturePort: number;
  requestTimeoutMs: number;
}

export function registerTools(
  server: Server,
  bridge: UnixSocketBridge,
  runtime: ToolRuntimeInfo
): void {
  const allTools: ToolDef[] = [
    ...tabTools(bridge),
    ...pageTools(bridge),
    ...interactionTools(bridge),
    ...utilityTools(bridge, runtime),
  ];

  const toolMap = new Map<string, ToolDef>();
  for (const tool of allTools) {
    toolMap.set(tool.name, tool);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolMap.get(name);

    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await tool.handler(args ?? {});

      // Attach relevant memories for browser tools that have a tabId
      let memories: Record<string, unknown> | undefined;
      if (args && typeof args.tabId === "number" && result && typeof result === "object") {
        const resultObj = result as Record<string, unknown>;
        const url = (resultObj.url as string) ?? (resultObj.newUrl as string);
        if (url) {
          try {
            const domain = new URL(url).hostname;
            const domainMemories = getMemoriesForDomain(domain);
            if (Object.keys(domainMemories).length > 0) {
              memories = domainMemories;
            }
          } catch {
            // URL parse failed, skip memories
          }
        }
      }

      const responseContent: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

      // Handle screenshot base64 responses
      if (name === "page_screenshot" && result && typeof result === "object") {
        const r = result as Record<string, unknown>;
        if (r.data && typeof r.data === "string") {
          responseContent.push({
            type: "image",
            data: r.data,
            mimeType: "image/png",
          });
        }
      }

      const output: Record<string, unknown> = { result };
      if (memories) {
        output.memories = memories;
      }

      if (responseContent.length === 0) {
        responseContent.push({
          type: "text",
          text: JSON.stringify(output, null, 2),
        });
      }

      return { content: responseContent };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  console.error(`[tools] Registered ${allTools.length} tools`);
}
