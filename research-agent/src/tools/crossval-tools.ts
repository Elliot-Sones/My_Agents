import type { ToolDef } from "../types.js";
import { runGemini, runKimi } from "../apis/cli-runner.js";

export function crossvalTools(): ToolDef[] {
  return [
    {
      name: "ask_gemini",
      description:
        "Search & answer via Gemini CLI (Google Search grounding). Returns Gemini's answer grounded in Google Search results. Free (1,000 req/day). Provides a different search source and reasoning than Claude or Perplexity. Requires the Gemini CLI to be installed globally (npm install -g @google/gemini-cli).",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Research question or topic to ask Gemini." },
        },
        required: ["query"],
      },
      handler: async (params) => {
        const query = params.query as string;
        const result = await runGemini(query);
        return {
          source: "gemini",
          query,
          answer: result.answer,
        };
      },
    },
    {
      name: "ask_kimi",
      description:
        "Search & answer via Kimi CLI (Moonshot AI search). Returns Kimi's answer using its built-in web search. Very cheap ($0.60/M input tokens). Chinese AI with different source access and perspective. Requires the Kimi CLI to be installed (brew install kimi-cli or npm install -g kimiai-cli).",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Research question or topic to ask Kimi." },
        },
        required: ["query"],
      },
      handler: async (params) => {
        const query = params.query as string;
        const result = await runKimi(query);
        return {
          source: "kimi",
          query,
          answer: result.answer,
        };
      },
    },
  ];
}
