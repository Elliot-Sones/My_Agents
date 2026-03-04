import { SearchResult, SearchSource } from "../types.js";
import { getConfig } from "../config.js";
import { searchPapers, getCitations } from "./semantic-scholar.js";
import { searchCode, searchOpinions } from "./exa.js";
import { askPerplexity } from "./perplexity.js";
import { searchRepos } from "./github.js";
import { searchImplementations } from "./papers-with-code.js";
import { searchX } from "./xai.js";
import { runGemini, runKimi } from "./cli-runner.js";

export class SearchManager {
  /**
   * Check if a source is configured (has required API key or is freely available).
   */
  isAvailable(source: SearchSource): boolean {
    const config = getConfig();

    switch (source) {
      case "semantic_scholar":
        // Semantic Scholar works without a key (just slower rate limits)
        return true;
      case "exa":
        return !!config.exaApiKey;
      case "perplexity":
        return !!config.perplexityApiKey;
      case "github":
        // GitHub search works without a token (just lower rate limits)
        return true;
      case "papers_with_code":
        // Papers With Code is free, no key needed
        return true;
      case "xai":
        return !!config.xaiApiKey;
      case "gemini":
        // Gemini CLI — availability depends on the binary being installed
        return true;
      case "kimi":
        return !!config.kimiApiKey;
      default:
        return false;
    }
  }

  /**
   * Get all sources that are currently available.
   */
  getAvailableSources(): SearchSource[] {
    const allSources: SearchSource[] = [
      "semantic_scholar",
      "exa",
      "perplexity",
      "github",
      "papers_with_code",
      "xai",
      "gemini",
      "kimi",
    ];
    return allSources.filter((s) => this.isAvailable(s));
  }

  /**
   * Dispatch a search to the appropriate API client based on source.
   */
  async search(
    source: SearchSource,
    query: string,
    options?: Record<string, unknown>,
  ): Promise<SearchResult[]> {
    if (!this.isAvailable(source)) {
      throw new Error(
        `Source "${source}" is not configured. Check that the required API key is set.`,
      );
    }

    try {
      switch (source) {
        case "semantic_scholar":
          return await searchPapers(query, options);

        case "exa":
          // Default to code search; caller can specify mode via options
          if (options?.mode === "opinions") {
            return await searchOpinions(query, options);
          }
          return await searchCode(query, options);

        case "perplexity": {
          const result = await askPerplexity(
            query,
            options?.model as "sonar" | "sonar-pro" | undefined,
          );
          // Wrap the Perplexity answer as a single SearchResult
          return [
            {
              id: `perplexity_${Date.now()}`,
              title: query,
              snippet: result.answer,
              source: "perplexity",
              metadata: {
                citations: result.citations,
                model: (options?.model as string) ?? "sonar",
              },
            },
          ];
        }

        case "github":
          return await searchRepos(query, options);

        case "papers_with_code":
          return await searchImplementations(query, options);

        case "xai": {
          const xResult = await searchX(query, options?.maxResults as number | undefined);
          // Wrap xAI answer as a single SearchResult
          return [
            {
              id: `xai_${Date.now()}`,
              title: query,
              snippet: xResult.answer,
              source: "xai",
              metadata: {
                citations: xResult.posts,
              },
            },
          ];
        }

        case "gemini": {
          const geminiResult = await runGemini(query);
          return [
            {
              id: `gemini_${Date.now()}`,
              title: query,
              snippet: geminiResult.answer,
              source: "gemini",
              metadata: {
                model: "gemini",
              },
              raw: geminiResult.raw,
            },
          ];
        }

        case "kimi": {
          const config = getConfig();
          const kimiResult = await runKimi(query, config.kimiApiKey);
          return [
            {
              id: `kimi_${Date.now()}`,
              title: query,
              snippet: kimiResult.answer,
              source: "kimi",
              metadata: {
                model: "kimi",
              },
              raw: kimiResult.raw,
            },
          ];
        }

        default:
          console.error(`[search-manager] Unknown source: ${source}`);
          return [];
      }
    } catch (error) {
      console.error(`[search-manager] Error searching ${source}:`, error);
      return [];
    }
  }
}

// Re-export individual functions for direct use by tools
export { searchPapers, getCitations } from "./semantic-scholar.js";
export { searchCode, searchOpinions } from "./exa.js";
export { askPerplexity } from "./perplexity.js";
export { searchRepos } from "./github.js";
export { searchImplementations } from "./papers-with-code.js";
export { searchX } from "./xai.js";
export { runGemini, runKimi } from "./cli-runner.js";
