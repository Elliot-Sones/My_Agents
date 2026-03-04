import type { ToolDef } from "../types.js";
import { askPerplexity } from "../apis/perplexity.js";
import { searchOpinions as exaSearchOpinions } from "../apis/exa.js";
import { searchX as xaiSearchX } from "../apis/xai.js";

export function opinionTools(): ToolDef[] {
  return [
    {
      name: "ask_perplexity",
      description:
        "Get a synthesized answer with citations via Perplexity Sonar. Returns a different AI's perspective with its own source set — useful for cross-validating research findings. Perplexity searches the web and synthesizes an answer.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Research question or topic to query." },
          model: {
            type: "string",
            description: '"sonar" (default, faster/cheaper) or "sonar-pro" (more thorough).',
            enum: ["sonar", "sonar-pro"],
          },
        },
        required: ["query"],
      },
      handler: async (params) => {
        const query = params.query as string;
        const model = params.model as "sonar" | "sonar-pro" | undefined;
        const result = await askPerplexity(query, model);
        return {
          source: "perplexity",
          query,
          model: model || "sonar",
          answer: result.answer,
          citations: result.citations,
        };
      },
    },
    {
      name: "search_opinions",
      description:
        "Search community discussions via Exa neural search. Finds authentic discussions on Reddit, Hacker News, forums, and blogs — not SEO content. Exa's neural search is especially good at finding real opinions and experiences.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for community discussions." },
          maxResults: { type: "number", description: "Maximum results to return (default 10)." },
          includeDomains: {
            type: "array",
            items: { type: "string" },
            description:
              'Domains to search (default: ["reddit.com", "news.ycombinator.com"]). Add others like "lobste.rs", "stackoverflow.com", etc.',
          },
        },
        required: ["query"],
      },
      handler: async (params) => {
        const query = params.query as string;
        const results = await exaSearchOpinions(query, {
          maxResults: params.maxResults as number | undefined,
          includeDomains: params.includeDomains as string[] | undefined,
        });
        return {
          source: "exa",
          mode: "opinions",
          query,
          resultCount: results.length,
          results,
        };
      },
    },
    {
      name: "search_x",
      description:
        "Search X/Twitter via xAI Grok API. The ONLY API with native X/Twitter search access. Returns relevant posts, threads, and expert opinions. Useful for real-time social sentiment and finding expert takes.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for X/Twitter posts." },
          maxResults: { type: "number", description: "Maximum results to return (default 10)." },
        },
        required: ["query"],
      },
      handler: async (params) => {
        const query = params.query as string;
        const result = await xaiSearchX(query, params.maxResults as number | undefined);
        return {
          source: "xai",
          query,
          answer: result.answer,
          posts: result.posts,
        };
      },
    },
  ];
}
