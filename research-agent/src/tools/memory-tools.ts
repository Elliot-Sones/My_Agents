import type { ToolDef } from "../types.js";
import {
  saveMemory,
  getMemoriesForDomain,
  getAllMemories,
  deleteMemory,
} from "../memory.js";

export function memoryTools(): ToolDef[] {
  return [
    {
      name: "memory_save",
      description:
        'Save a strategy, source quality assessment, or preference. Key format: "domain::category::identifier" (e.g., "ml::strategy::transformer_papers"). Categories: strategy (what search approaches work), source_quality (learned API/source assessments), preference (user output preferences).',
      inputSchema: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description:
              'Memory key in format "domain::category::identifier". Category must be strategy, source_quality, or preference.',
          },
          value: { type: "string", description: "The memory content to save." },
        },
        required: ["key", "value"],
      },
      handler: async (params) => {
        const key = params.key as string;
        const value = params.value as string;
        const parts = key.split("::");
        if (parts.length < 3) {
          return { error: 'Key must be in format "domain::category::identifier"' };
        }
        const category = parts[1];
        if (!["strategy", "source_quality", "preference"].includes(category)) {
          return { error: "Category must be strategy, source_quality, or preference" };
        }
        saveMemory(key, value);
        return { success: true, key };
      },
    },
    {
      name: "memory_recall",
      description:
        "Recall memories for a domain, optionally filtered by category. Used at research_start to load prior strategies.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain to recall memories for (e.g., 'ml', 'security')." },
          category: {
            type: "string",
            description: "Optional category filter: strategy, source_quality, or preference.",
            enum: ["strategy", "source_quality", "preference"],
          },
        },
        required: ["domain"],
      },
      handler: async (params) => {
        const domain = params.domain as string;
        const category = params.category as string | undefined;
        const memories = getMemoriesForDomain(domain, category);
        return {
          domain,
          category: category || "all",
          count: Object.keys(memories).length,
          memories,
        };
      },
    },
    {
      name: "memory_list",
      description: "List all memories, optionally filtered by domain.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Optional domain filter." },
        },
      },
      handler: async (params) => {
        const domain = params.domain as string | undefined;
        if (domain) {
          const memories = getMemoriesForDomain(domain);
          return {
            domain,
            count: Object.keys(memories).length,
            memories,
          };
        }
        const all = getAllMemories();
        return {
          count: Object.keys(all).length,
          memories: Object.entries(all).map(([key, mem]) => ({
            key,
            value: mem.value,
            confidence: mem.confidence,
            version: mem.version,
            lastUsed: new Date(mem.last_used).toISOString(),
          })),
        };
      },
    },
  ];
}
