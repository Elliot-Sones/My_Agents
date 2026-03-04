import { SearchResult } from "../types.js";

const BASE_URL = "https://paperswithcode.com/api/v1/search/";

interface PwcPaper {
  title?: string;
  abstract?: string;
  url_abs?: string;
  authors?: string[];
}

interface PwcRepository {
  url?: string;
  stars?: number;
  framework?: string;
}

interface PwcResultItem {
  paper?: PwcPaper;
  repository?: PwcRepository;
}

interface PwcResponse {
  count?: number;
  results?: PwcResultItem[];
}

interface SearchImplementationsOptions {
  maxResults?: number;
}

export async function searchImplementations(
  query: string,
  options?: SearchImplementationsOptions,
): Promise<SearchResult[]> {
  const maxResults = options?.maxResults ?? 10;

  try {
    const params = new URLSearchParams({
      q: query,
      page: "1",
    });

    const response = await fetch(`${BASE_URL}?${params.toString()}`, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[papers-with-code] Search failed (${response.status}): ${text}`);
      return [];
    }

    const data = (await response.json()) as PwcResponse;
    const items = (data.results ?? []).slice(0, maxResults);

    return items.map((item, index): SearchResult => {
      const paper = item.paper;
      const repo = item.repository;

      return {
        id: `pwc_${index}`,
        title: paper?.title || "Untitled",
        url: repo?.url || paper?.url_abs || undefined,
        snippet: paper?.abstract?.slice(0, 500) || "",
        source: "papers_with_code",
        metadata: {
          authors: paper?.authors,
          stars: repo?.stars,
          framework: repo?.framework,
        },
        raw: item,
      };
    });
  } catch (error) {
    console.error("[papers-with-code] Search error:", error);
    return [];
  }
}
