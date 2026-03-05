import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolDef } from "../types.js";
import { monitorTools } from "./monitor-tools.js";

export function registerTools(server: Server): void {
  const allTools: ToolDef[] = [...monitorTools()];

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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ result }, null, 2),
          },
        ],
      };
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
