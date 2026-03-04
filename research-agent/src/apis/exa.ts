import { SearchResult } from "../types.js";
import { getConfig } from "../config.js";

const BASE_URL = "https://api.exa.ai/search";

interface ExaResult {
  url: string;
  title: string;
  text?: string;
  score?: number;
  publishedDate?: string;
  author?: string;
}

interface ExaResponse {
  results: ExaResult[];
}

interface SearchCodeOptions {
  maxResults?: number;
  language?: string;
}

interface SearchOpinionsOptions {
  maxResults?: number;
  includeDomains?: string[];
}

function getHeaders(): Record<string, string> {
  const config = getConfig();
  return {
    "x-api-key": config.exaApiKey || "",
    "Content-Type": "application/json",
  };
}

function mapResultToSearchResult(result: ExaResult, index: number): SearchResult {
  return {
    id: `exa_${index}`,
    title: result.title || "Untitled",
    url: result.url,
    snippet: result.text?.slice(0, 500) || "",
    source: "exa",
    metadata: {
      authors: result.author ? [result.author] : undefined,
      lastUpdated: result.publishedDate,
    },
    raw: result,
  };
}

export async function searchCode(
  query: string,
  options?: SearchCodeOptions,
): Promise<SearchResult[]> {
  const maxResults = options?.maxResults ?? 10;

  try {
    const body: Record<string, unknown> = {
      query,
      numResults: maxResults,
      type: "neural",
      useAutoprompt: true,
      contents: { text: true },
      includeDomains: ["github.com", "gitlab.com", "bitbucket.org"],
    };

    if (options?.language) {
      body.query = `${query} ${options.language}`;
    }

    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[exa] searchCode failed (${response.status}): ${text}`);
      return [];
    }

    const data = (await response.json()) as ExaResponse;
    return (data.results ?? []).map(mapResultToSearchResult);
  } catch (error) {
    console.error("[exa] searchCode error:", error);
    return [];
  }
}

export async function searchOpinions(
  query: string,
  options?: SearchOpinionsOptions,
): Promise<SearchResult[]> {
  const maxResults = options?.maxResults ?? 10;
  const includeDomains = options?.includeDomains ?? [
    "reddit.com",
    "news.ycombinator.com",
  ];

  try {
    const body: Record<string, unknown> = {
      query,
      numResults: maxResults,
      type: "neural",
      useAutoprompt: true,
      contents: { text: true },
      includeDomains,
    };

    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[exa] searchOpinions failed (${response.status}): ${text}`);
      return [];
    }

    const data = (await response.json()) as ExaResponse;
    return (data.results ?? []).map(mapResultToSearchResult);
  } catch (error) {
    console.error("[exa] searchOpinions error:", error);
    return [];
  }
}
