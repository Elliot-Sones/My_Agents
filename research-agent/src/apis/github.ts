import { SearchResult } from "../types.js";
import { getConfig } from "../config.js";

const BASE_URL = "https://api.github.com/search/repositories";

interface GitHubRepoItem {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  pushed_at: string;
  owner: {
    login: string;
  };
}

interface GitHubSearchResponse {
  total_count: number;
  items: GitHubRepoItem[];
}

interface SearchReposOptions {
  maxResults?: number;
  language?: string;
  minStars?: number;
}

export async function searchRepos(
  query: string,
  options?: SearchReposOptions,
): Promise<SearchResult[]> {
  const maxResults = options?.maxResults ?? 10;

  try {
    let q = query;
    if (options?.language) {
      q += ` language:${options.language}`;
    }
    if (options?.minStars !== undefined) {
      q += ` stars:>=${options.minStars}`;
    }

    const params = new URLSearchParams({
      q,
      per_page: String(maxResults),
      sort: "stars",
      order: "desc",
    });

    const config = getConfig();
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github+json",
    };
    if (config.githubToken) {
      headers["Authorization"] = `Bearer ${config.githubToken}`;
    }

    const response = await fetch(`${BASE_URL}?${params.toString()}`, { headers });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[github] Search failed (${response.status}): ${text}`);
      return [];
    }

    const data = (await response.json()) as GitHubSearchResponse;
    return (data.items ?? []).map((item): SearchResult => ({
      id: `gh_${item.id}`,
      title: item.full_name,
      url: item.html_url,
      snippet: item.description || "",
      source: "github",
      metadata: {
        stars: item.stargazers_count,
        language: item.language || undefined,
        lastUpdated: item.pushed_at,
      },
      raw: item,
    }));
  } catch (error) {
    console.error("[github] Search error:", error);
    return [];
  }
}
