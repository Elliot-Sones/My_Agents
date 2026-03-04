import type { ToolDef } from "../types.js";
import { searchCode } from "../apis/exa.js";
import { searchRepos } from "../apis/github.js";
import { searchImplementations } from "../apis/papers-with-code.js";
import type { SearchResult } from "../types.js";

export function codeTools(): ToolDef[] {
  return [
    {
      name: "code_search",
      description:
        "Find code implementations and repositories via Exa semantic search + GitHub API. Exa searches billions of repos by meaning (not just keywords). GitHub supplements with structured metadata (stars, language, activity). Returns combined results from both sources.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for code/repos." },
          maxResults: { type: "number", description: "Maximum results per source (default 10)." },
          language: { type: "string", description: "Filter by programming language (e.g., python, typescript)." },
          minStars: { type: "number", description: "Minimum GitHub stars (GitHub results only)." },
        },
        required: ["query"],
      },
      handler: async (params) => {
        const query = params.query as string;
        const maxResults = (params.maxResults as number) || 10;
        const language = params.language as string | undefined;
        const minStars = params.minStars as number | undefined;

        const results: SearchResult[] = [];
        const errors: string[] = [];

        // Search both Exa and GitHub in parallel
        const [exaResults, ghResults] = await Promise.allSettled([
          searchCode(query, { maxResults, language }),
          searchRepos(query, { maxResults, language, minStars }),
        ]);

        if (exaResults.status === "fulfilled") {
          results.push(...exaResults.value);
        } else {
          errors.push(`Exa: ${exaResults.reason}`);
        }

        if (ghResults.status === "fulfilled") {
          results.push(...ghResults.value);
        } else {
          errors.push(`GitHub: ${ghResults.reason}`);
        }

        return {
          sources: ["exa", "github"],
          query,
          resultCount: results.length,
          results,
          ...(errors.length > 0 ? { errors } : {}),
        };
      },
    },
    {
      name: "paper_implementations",
      description:
        "Find code implementations of specific papers via Papers With Code. Links academic papers to their GitHub repositories with framework info and star counts. Free API, no key needed.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Paper title, topic, or keyword to search for implementations." },
          maxResults: { type: "number", description: "Maximum results to return (default 10)." },
        },
        required: ["query"],
      },
      handler: async (params) => {
        const query = params.query as string;
        const results = await searchImplementations(query, {
          maxResults: params.maxResults as number | undefined,
        });
        return {
          source: "papers_with_code",
          query,
          resultCount: results.length,
          results,
        };
      },
    },
  ];
}
